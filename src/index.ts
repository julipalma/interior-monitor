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
import { appendMonitorLog, initMonitorLogging } from "./logging/monitorLog.js";
import { formatArticleBlockLines, formatGroupedReportTxt } from "./report/groupedTxt.js";
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
import { canonicalArticleUrl } from "./utils/canonicalUrl.js";
import { decodeHtmlEntities } from "./utils/decodeHtmlEntities.js";
import { inferTitleFromUrl } from "./utils/titleFromUrl.js";
import { mapLimit } from "./utils/mapLimit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TAGS_CSV = join(
  __dirname,
  "..",
  "data",
  "frecuencia_tags_unificado.csv",
);

const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const FETCH_CONCURRENCY = Number(process.env.FETCH_CONCURRENCY ?? "3");
const GROUPED_TXT_PATH = process.env.GROUPED_TXT_PATH ?? "salida-notas.txt";
/** Máx. notas a inspeccionar con HTML/JSON-LD por medio (por fecha desc.). */
const MAX_DEEP_INSPECT = Number(process.env.MAX_DEEP_INSPECT ?? "400");
const ONLY_SIM_ONE = process.env.SEMANTIC_ONLY_SIM_ONE === "1";
const HEALTH_STREAK_THRESHOLD = Number(
  process.env.HEALTH_STREAK_THRESHOLD ?? "3",
);

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

function bestEffortTitle(base: string, url: string): string {
  const b = decodeHtmlEntities(base).trim();
  if (b && b !== url) return b;
  return inferTitleFromUrl(url) ?? (b || url);
}

function titleFromInspectHtml(
  html: string | undefined,
  base: string,
  url: string,
): string {
  if (!html) return bestEffortTitle(base, url);
  const t = extractTitleFromHtml(html);
  if (t?.trim()) return t.trim();
  return bestEffortTitle(base, url);
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
      const title = titleFromInspectHtml(r.html, c.title, c.url);
      out.push({
        ...c,
        title,
        sourceId: source.id,
        sourceName: source.name,
        content: source.content,
        disableHtmlFetchForSemantic: source.semantic?.disableHtmlFetch === true,
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
        const title = titleFromInspectHtml(r.html, c.title, c.url);
        return {
          ...c,
          title,
          sourceId: source.id,
          sourceName: source.name,
          content: source.content,
          disableHtmlFetchForSemantic: source.semantic?.disableHtmlFetch === true,
        } satisfies MatchedArticle;
      } catch (e) {
        health.markError(source.id, "match", c.url, e);
        console.error(`[${source.id}] fallo al analizar ${c.url}:`, e);
        void appendMonitorLog(
          `[${source.id}] match ${c.url}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`,
        );
        return null;
      }
    },
  );

  return batch.filter((x): x is MatchedArticle => x != null);
}

/** Un solo mensaje de Slack: por medio, sin repetir nombre; cada nota con título, fecha, URL y Temas. */
function formatSlackMessage(items: MatchedArticle[]): string {
  const order: string[] = [];
  const by = new Map<string, MatchedArticle[]>();
  for (const m of items) {
    if (!by.has(m.sourceName)) {
      order.push(m.sourceName);
      by.set(m.sourceName, []);
    }
    by.get(m.sourceName)!.push(m);
  }
  const blocks = order.map((name) => {
    const list = by.get(name)!;
    const chunks = list.map((m) => formatArticleBlockLines(m).join("\n"));
    return [`*${name}*`, "", chunks.join("\n\n---\n\n")].join("\n");
  });
  const countLabel =
    items.length === 1 ? "1 nota nueva" : `${items.length} notas nuevas`;
  return `:newspaper: *Notas de policiales del interior* — ${countLabel}\n\n${blocks.join("\n\n")}`;
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
  await initMonitorLogging();
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
  /** Errores y salud de fuentes solo en archivo .log (rotación 30 días), nunca en Slack. */
  async function publishHealthLog(): Promise<void> {
    const { nextState, summary } = health.finalize(
      previousHealth,
      Number.isFinite(HEALTH_STREAK_THRESHOLD) && HEALTH_STREAK_THRESHOLD > 0
        ? Math.floor(HEALTH_STREAK_THRESHOLD)
        : 3,
    );
    await saveHealthState(nextState);
    const alertCfg = healthAlertConfigFromEnv();
    const evalRes = evaluateHealthSeverity(summary, alertCfg);
    const block = evalRes.shouldNotify
      ? formatHealthSlackAlertMessage(summary, evalRes)
      : formatHealthSlackMessage(summary);
    console.error(
      `[health] severity=${evalRes.severity} shouldNotify=${evalRes.shouldNotify} (detalle en log)`,
    );
    await appendMonitorLog(
      `[health] severity=${evalRes.severity} shouldNotify=${evalRes.shouldNotify}\n${block}`,
    );
  }

  for (const source of sources) {
    console.error(`[${source.id}] descargando sitemap…`);
    let candidates: ArticleCandidate[];
    try {
      candidates = await collectCandidates(source);
    } catch (e) {
      health.markError(source.id, "sitemap", source.sitemapUrl, e);
      console.error(`[${source.id}] error de sitemap:`, e);
      await appendMonitorLog(
        `[${source.id}] sitemap ${source.sitemapUrl}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`,
      );
      continue;
    }

    console.error(`[${source.id}] ${candidates.length} URLs en sitemap(s)`);
    const matched = await matchForSource(source, candidates, health);
    console.error(`[${source.id}] ${matched.length} coinciden con la sección`);

    for (const m of matched) {
      const key = canonicalArticleUrl(m.url);
      if (!seen.has(key)) {
        fresh.push(m);
      }
    }
  }

  if (fresh.length === 0) {
    console.error("Sin novedades para notificar.");
    await publishHealthLog();
    return;
  }

  await enrichMatchedArticlesFromHtml(fresh, FETCH_CONCURRENCY, {
    lexicon: tagLexicon,
    scoreOpts: scoreOpts ?? undefined,
    hybridTagger: hybridRuntime.tagger,
    onError: ({ sourceId, phase, url, error }) => {
      health.markError(sourceId, phase, url, error);
      void appendMonitorLog(
        `[${sourceId}] ${phase} ${url}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
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
    for (const m of fresh) seen.add(canonicalArticleUrl(m.url));
    await saveSeen(seen);
    await publishHealthLog();
    return;
  }
  await writeFile(
    GROUPED_TXT_PATH,
    formatGroupedReportTxt(outgoing),
    "utf8",
  );
  console.error(`Listado por medio en ${GROUPED_TXT_PATH}`);

  /** Persistir antes de Slack: si el webhook falla o el job corta, no re-notificar lo mismo. */
  for (const m of fresh) seen.add(canonicalArticleUrl(m.url));
  await saveSeen(seen);

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

  await publishHealthLog();
}

main().catch(async (e) => {
  console.error(e);
  await appendMonitorLog(
    `[fatal] ${e instanceof Error ? e.stack ?? e.message : String(e)}`,
  ).catch(() => {});
  process.exit(1);
});
