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
import { inferTitleFromUrl } from "../utils/titleFromUrl.js";
import { hasVideoFromHtml } from "../filters/videoSignal.js";

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
    const hasPrefetched = Boolean(m.prefetchedText && m.prefetchedText.trim());
    const canFetchHtml = m.disableHtmlFetchForSemantic !== true || needsTitle;
    const needsSemantic = Boolean(lexicon) && (m.disableHtmlFetchForSemantic !== true || hasPrefetched);
    if (!needsTitle && !needsSemantic) return;

    try {
      if (m.disableHtmlFetchForSemantic === true && !needsTitle) {
        if (needsSemantic && lexicon && hasPrefetched) {
          const opts = options.scoreOpts ?? scoreOptionsFromEnv();
          const lexical = scoreArticleAgainstLexicon(
            [m.title, m.prefetchedText!].filter(Boolean).join("\n"),
            lexicon,
            opts,
          );
          m.semantic = options.hybridTagger
            ? await options.hybridTagger(m.prefetchedText!, lexical)
            : lexical;
        }
        return;
      }

      if (!canFetchHtml) return;

      const html = await fetchHtml(m.url);
      if (needsTitle) {
        const t = extractTitleFromHtml(html);
        if (t) m.title = t;
      }
      // Detectar video en el HTML si aún no fue marcado por el título
      if (!m.hasVideo) {
        m.hasVideo = hasVideoFromHtml(html);
      }
      if (needsSemantic && lexicon) {
        const opts = options.scoreOpts ?? scoreOptionsFromEnv();
        const text = buildArticleTextForScoring(html, m.title, m.content);
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
      // Fallback final: si el HTML está bloqueado (403), al menos inferir un título legible del slug.
      if (needsTitle) {
        const inferred = inferTitleFromUrl(m.url);
        if (inferred) m.title = inferred;
      }
    }
  });
}
