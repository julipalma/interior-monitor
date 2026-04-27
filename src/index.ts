import { writeFile } from "node:fs/promises";
import { enrichArticleTitles } from "./article/enrichTitles.js";
import { extractTitleFromHtml } from "./article/titleFromHtml.js";
import { sources } from "./config/sources.js";
import { formatGroupedReportTxt } from "./report/groupedTxt.js";
import { inspectArticle } from "./section/detect.js";
import { collectCandidates } from "./sitemap/collect.js";
import { formatSlackLocalPreview, postSlackWebhook } from "./slack.js";
import { loadSeen, saveSeen } from "./state.js";
import type { ArticleCandidate, MatchedArticle, NewsSource } from "./types.js";
import { mapLimit } from "./utils/mapLimit.js";

const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const FETCH_CONCURRENCY = Number(process.env.FETCH_CONCURRENCY ?? "3");
const GROUPED_TXT_PATH = process.env.GROUPED_TXT_PATH ?? "salida-notas.txt";
/** Máx. notas a inspeccionar con HTML/JSON-LD por medio (por fecha desc.). */
const MAX_DEEP_INSPECT = Number(process.env.MAX_DEEP_INSPECT ?? "400");

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
        console.error(`[${source.id}] fallo al analizar ${c.url}:`, e);
        return null;
      }
    },
  );

  return batch.filter((x): x is MatchedArticle => x != null);
}

function formatSlackMessage(items: MatchedArticle[]): string {
  const blocks = items.map(
    (m) =>
      `*${m.sourceName}*\n${m.title}\n${m.publishedAt || "sin fecha"}\n${m.url}`,
  );
  return `:newspaper: *Interior monitor* — ${items.length} nota(s) nueva(s)\n\n${blocks.join("\n\n---\n\n")}`;
}

async function main(): Promise<void> {
  const seen = await loadSeen();
  const fresh: MatchedArticle[] = [];

  for (const source of sources) {
    console.error(`[${source.id}] descargando sitemap…`);
    let candidates: ArticleCandidate[];
    try {
      candidates = await collectCandidates(source);
    } catch (e) {
      console.error(`[${source.id}] error de sitemap:`, e);
      continue;
    }

    console.error(`[${source.id}] ${candidates.length} URLs en sitemap(s)`);
    const matched = await matchForSource(source, candidates);
    console.error(`[${source.id}] ${matched.length} coinciden con la sección`);

    for (const m of matched) {
      if (!seen.has(m.url)) {
        fresh.push(m);
      }
    }
  }

  if (fresh.length === 0) {
    console.error("Sin novedades para notificar.");
    return;
  }

  await enrichArticleTitles(fresh, FETCH_CONCURRENCY);
  await writeFile(
    GROUPED_TXT_PATH,
    formatGroupedReportTxt(fresh),
    "utf8",
  );
  console.error(`Listado por medio en ${GROUPED_TXT_PATH}`);

  const message = formatSlackMessage(fresh);
  if (WEBHOOK) {
    await postSlackWebhook(WEBHOOK, message);
    console.error(`Notificación enviada (${fresh.length} notas).`);
  } else {
    process.stdout.write(formatSlackLocalPreview(message));
    console.error(
      "SLACK_WEBHOOK_URL no definido: arriba está la vista previa del mensaje que enviaría Slack.",
    );
  }

  for (const m of fresh) seen.add(m.url);
  await saveSeen(seen);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
