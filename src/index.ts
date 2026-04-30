import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { enrichMatchedArticlesFromHtml } from "./article/enrichFromHtml.js";
import { extractTitleFromHtml } from "./article/titleFromHtml.js";
import { sources } from "./config/sources.js";
import {
  evaluateHealthSeverity,
  formatHealthSlackAlertMessage,
  formatHealthSlackMessage,
  HealthTracker,
  healthAlertConfigFromEnv,
} from "./monitoring/health.js";
import { formatGroupedReportTxt } from "./report/groupedTxt.js";
import { inspectArticle } from "./section/detect.js";
import { createHybridRuntime } from "./semantic/hybridClassifier.js";
import { collectCandidates } from "./sitemap/collect.js";
import { formatSlackLocalPreview, postSlackWebhook } from "./slack.js";
import {
  loadHealthState,
  loadSeen,
  saveHealthState,
  saveSeen,
} from "./state.js";
import { loadFrecuenciaCsvFile } from "./tags/loadFrecuenciaCsv.js";
import { scoreOptionsFromEnv } from "./tags/scoreArticle.js";
import type { ArticleCandidate, MatchedArticle, NewsSource } from "./types.js";
import { mapLimit } from "./utils/mapLimit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TAGS_CSV = join(
  __dirname,
  "..",
  "data",
  "frecuencia_tags_unificado.csv",
);

const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const HEALTH_WEBHOOK = process.env.SLACK_HEALTH_WEBHOOK_URL ?? WEBHOOK;
const FETCH_CONCURRENCY = Number(process.env.FETCH_CONCURRENCY ?? "3");
const GROUPED_TXT_PATH = process.env.GROUPED_TXT_PATH ?? "salida-notas.txt";
/** Máx. notas a inspeccionar con HTML/JSON-LD por medio (por fecha desc.). */
const MAX_DEEP_INSPECT = Number(process.env.MAX_DEEP_INSPECT ?? "400");
const ONLY_SIM_ONE = process.env.SEMANTIC_ONLY_SIM_ONE === "1";
const HEALTH_STREAK_THRESHOLD = Number(
  process.env.HEALTH_STREAK_THRESHOLD ?? "3",
);
const HEALTH_NOTIFY_ONLY_ON_ALERT =
  process.env.HEALTH_NOTIFY_ONLY_ON_ALERT !== "0";

function needsArticleFetch(source: NewsSource): boolean {
  return (
    source.detection.kind === "html_badge" ||
    source.detection.kind === "json_ld_article_section"
  );
}

function sortNewestFirst(candidates: ArticleCandidate[]): ArticleCandidate[] {
  return [...candidates].sort((a, b) => {
    const ta = Date.parse(a.publishedAt);
    const tb = Date.parse(b.publishedAt);
    const da = Number.isFinite(ta) ? ta : 0;
    const db = Number.isFinite(tb) ? tb : 0;
    return db - da;
  });
}

function limitDeepInspect(
  candidates: ArticleCandidate[],
): ArticleCandidate[] {
  if (!Number.isFinite(MAX_DEEP_INSPECT) || MAX_DEEP_INSPECT <= 0) {
    return candidates;
  }
  const sorted = sortNewestFirst(candidates);
  if (sorted.length <= MAX_DEEP_INSPECT) return sorted;
  return sorted.slice(0, MAX_DEEP_INSPECT);
}

function titleFromInspectHtml(html: string | undefined, base: string): string {
  if (!html) return base;
  const t = extractTitleFromHtml(html);
  return t ?? base;
}

async function matchForSource(
  source: NewsSource,
  candidates: ArticleCandidate[],
  health: HealthTracker,
): Promise<MatchedArticle[]> {
  if (!needsArticleFetch(source)) {
    const out: MatchedArticle[] = [];
    for (const c of candidates) {
      const r = await inspectArticle(c, source.detection);
      if (!r.matches) continue;
      const title = titleFromInspectHtml(r.html, c.title);
      out.push({
        ...c,
        title,
        sourceId: source.id,
        sourceName: source.name,
      });
    }
    return out;
  }

  const toInspect = limitDeepInspect(candidates);
  if (toInspect.length < candidates.length) {
    console.error(
      `[${source.id}] inspección profunda limitada a ${toInspect.length}/${candidates.length} (MAX_DEEP_INSPECT)`,
    );
  }

  const batch = await mapLimit(
    toInspect,
    Number.isFinite(FETCH_CONCURRENCY) && FETCH_CONCURRENCY > 0
      ? FETCH_CONCURRENCY
      : 3,
    async (c) => {
      try {
        const r = await inspectArticle(c, source.detection);
        if (!r.matches) return null;
        const title = titleFromInspectHtml(r.html, c.title);
        return {
          ...c,
          title,
          sourceId: source.id,
          sourceName: source.name,
        } satisfies MatchedArticle;
      } catch (e) {
        health.markError(source.id, "match", c.url, e);
        console.error(`[${source.id}] fallo al analizar ${c.url}:`, e);
        return null;
      }
    },
  );

  return batch.filter((x): x is MatchedArticle => x != null);
}

function formatSemanticSlack(m: MatchedArticle): string {
  const sem = m.semantic;
  if (!sem?.matches?.length) return "";
  const tops = sem.matches
    .slice(0, 3)
    .map((x) => `${x.tag} (${x.weightedScore.toFixed(2)})`)
    .join(", ");
  return `_Temas:_ ${tops}`;
}

function formatSlackMessage(items: MatchedArticle[]): string {
  const blocks = items.map((m) => {
    const base = `*${m.sourceName}*\n${m.title}\n${m.publishedAt || "sin fecha"}\n${m.url}`;
    const sem = formatSemanticSlack(m);
    return sem ? `${base}\n${sem}` : base;
  });
  return `:newspaper: *Interior monitor* — ${items.length} nota(s) nueva(s)\n\n${blocks.join("\n\n---\n\n")}`;
}

async function loadTagLexicon() {
  if (process.env.SEMANTIC_DISABLE === "1") {
    console.error("[tags] SEMANTIC_DISABLE=1: sin alineación por CSV.");
    return null;
  }
  const fromEnv = process.env.TAGS_CSV_PATH?.trim();
  const path = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_TAGS_CSV;
  try {
    const rows = await loadFrecuenciaCsvFile(path);
    if (rows.length === 0) {
      console.error(`[tags] CSV vacío o inválido: ${path}`);
      return null;
    }
    console.error(`[tags] ${rows.length} filas de frecuencia desde ${path}`);
    return rows;
  } catch (e) {
    console.error(`[tags] no se pudo leer ${path}:`, e);
    return null;
  }
}

async function main(): Promise<void> {
  const tagLexicon = await loadTagLexicon();
  const scoreOpts = tagLexicon ? scoreOptionsFromEnv() : null;
  const hybridRuntime = await createHybridRuntime(
    tagLexicon,
    scoreOpts ?? scoreOptionsFromEnv(),
  );
  const seen = await loadSeen();
  const previousHealth = await loadHealthState();
  const health = new HealthTracker(sources);
  const fresh: MatchedArticle[] = [];
  async function publishHealth(): Promise<void> {
    const { nextState, summary } = health.finalize(
      previousHealth,
      Number.isFinite(HEALTH_STREAK_THRESHOLD) && HEALTH_STREAK_THRESHOLD > 0
        ? Math.floor(HEALTH_STREAK_THRESHOLD)
        : 3,
    );
    await saveHealthState(nextState);
    const alertCfg = healthAlertConfigFromEnv();
    const evalRes = evaluateHealthSeverity(summary, alertCfg);
    const baseMessage = formatHealthSlackMessage(summary);
    const alertMessage = formatHealthSlackAlertMessage(summary, evalRes);
    console.error(
      `[health] severity=${evalRes.severity} notify=${
        evalRes.shouldNotify || !HEALTH_NOTIFY_ONLY_ON_ALERT
      }`,
    );
    console.error(baseMessage.replace(/\n/g, " | "));
    if (HEALTH_WEBHOOK && (evalRes.shouldNotify || !HEALTH_NOTIFY_ONLY_ON_ALERT)) {
      await postSlackWebhook(
        HEALTH_WEBHOOK,
        evalRes.shouldNotify ? alertMessage : baseMessage,
      );
    } else {
      process.stdout.write(
        formatSlackLocalPreview(
          evalRes.shouldNotify ? alertMessage : baseMessage,
        ),
      );
      console.error(
        HEALTH_WEBHOOK
          ? "Health OK: sin alerta operativa, no se envía webhook."
          : "SLACK_HEALTH_WEBHOOK_URL no definido: arriba está la vista previa del mensaje de salud.",
      );
    }
  }

  for (const source of sources) {
    console.error(`[${source.id}] descargando sitemap…`);
    let candidates: ArticleCandidate[];
    try {
      candidates = await collectCandidates(source);
    } catch (e) {
      health.markError(source.id, "sitemap", source.sitemapUrl, e);
      console.error(`[${source.id}] error de sitemap:`, e);
      continue;
    }

    console.error(`[${source.id}] ${candidates.length} URLs en sitemap(s)`);
    const matched = await matchForSource(source, candidates, health);
    console.error(`[${source.id}] ${matched.length} coinciden con la sección`);

    for (const m of matched) {
      if (!seen.has(m.url)) {
        fresh.push(m);
      }
    }
  }

  if (fresh.length === 0) {
    console.error("Sin novedades para notificar.");
    await publishHealth();
    return;
  }

  await enrichMatchedArticlesFromHtml(fresh, FETCH_CONCURRENCY, {
    lexicon: tagLexicon,
    scoreOpts: scoreOpts ?? undefined,
    hybridTagger: hybridRuntime.tagger,
    onError: ({ sourceId, phase, url, error }) => {
      health.markError(sourceId, phase, url, error);
    },
  });
  const outgoing =
    tagLexicon && hybridRuntime.requireMatch
      ? fresh.filter((m) => {
          const sem = m.semantic;
          const passes = Boolean(
            sem &&
              sem.matches.length > 0 &&
              sem.score >= hybridRuntime.minInterestScore,
          );
          if (!passes) return false;
          if (!ONLY_SIM_ONE) return true;
          return sem!.matches.some((x) => x.similarity >= 1);
        })
      : fresh;
  if (outgoing.length < fresh.length) {
    console.error(
      `[semantic] ${fresh.length - outgoing.length} nota(s) descartada(s) por falta de interés temático.`,
    );
  }
  if (outgoing.length === 0) {
    console.error("Sin notas de interés para notificar.");
    for (const m of fresh) seen.add(m.url);
    await saveSeen(seen);
    await publishHealth();
    return;
  }
  await writeFile(
    GROUPED_TXT_PATH,
    formatGroupedReportTxt(outgoing),
    "utf8",
  );
  console.error(`Listado por medio en ${GROUPED_TXT_PATH}`);

  const message = formatSlackMessage(outgoing);
  if (WEBHOOK) {
    await postSlackWebhook(WEBHOOK, message);
    console.error(`Notificación enviada (${outgoing.length} notas).`);
  } else {
    process.stdout.write(formatSlackLocalPreview(message));
    console.error(
      "SLACK_WEBHOOK_URL no definido: arriba está la vista previa del mensaje que enviaría Slack.",
    );
  }

  for (const m of fresh) seen.add(m.url);
  await saveSeen(seen);
  await publishHealth();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
