import type { FrecuenciaTagRow } from "../tags/loadFrecuenciaCsv.js";
import type { ErrorPhase } from "../monitoring/health.js";
import {
  scoreArticleAgainstLexicon,
  scoreOptionsFromEnv,
  type ScoreArticleOptions,
} from "../tags/scoreArticle.js";
import type { HybridTagger } from "../semantic/hybridClassifier.js";
import { fetchHtml } from "../sitemap/http.js";
import type { MatchedArticle } from "../types.js";
import { mapLimit } from "../utils/mapLimit.js";
import { buildArticleTextForScoring } from "./articleTextFromHtml.js";
import { extractTitleFromHtml } from "./titleFromHtml.js";
import { titleNeedsHtmlFetch } from "./titleNeeds.js";

export type EnrichFromHtmlOptions = {
  lexicon?: FrecuenciaTagRow[] | null;
  scoreOpts?: ScoreArticleOptions;
  hybridTagger?: HybridTagger | null;
  onError?: (args: {
    sourceId: string;
    phase: ErrorPhase;
    url: string;
    error: unknown;
  }) => void;
};

/**
 * Una sola petición HTML por nota cuando hace falta título y/o alineación con tags.
 */
export async function enrichMatchedArticlesFromHtml(
  items: MatchedArticle[],
  concurrency: number,
  options: EnrichFromHtmlOptions,
): Promise<void> {
  if (items.length === 0) return;

  const lexicon =
    options.lexicon && options.lexicon.length > 0 ? options.lexicon : null;
  const n = Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 3;

  await mapLimit(items, n, async (m) => {
    const needsTitle = titleNeedsHtmlFetch(m.title, m.url);
    const needsSemantic = Boolean(lexicon);
    if (!needsTitle && !needsSemantic) return;

    try {
      const html = await fetchHtml(m.url);
      if (needsTitle) {
        const t = extractTitleFromHtml(html);
        if (t) m.title = t;
      }
      if (needsSemantic && lexicon) {
        const opts = options.scoreOpts ?? scoreOptionsFromEnv();
        const text = buildArticleTextForScoring(html, m.title);
        const lexical = scoreArticleAgainstLexicon(text, lexicon, opts);
        m.semantic = options.hybridTagger
          ? await options.hybridTagger(text, lexical)
          : lexical;
      }
    } catch (e) {
      options.onError?.({
        sourceId: m.sourceId,
        phase: "enrich",
        url: m.url,
        error: e,
      });
      if (needsSemantic) {
        console.error(`[enrich-html] fallo ${m.url}:`, e);
      }
      /* título: mantener valor del sitemap como antes */
    }
  });
}
