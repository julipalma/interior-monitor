import type { ArticleSemantic, SemanticTagMatch } from "../types.js";
import {
  meaningfulTokensFromNormalizedTag,
  normalizeForMatch,
} from "../utils/normalizeForMatch.js";
import type { FrecuenciaTagRow } from "./loadFrecuenciaCsv.js";

export type ScoreArticleOptions = {
  minSimilarity: number;
  topMatches: number;
  /** multiplicador de similitud si el tag está en `genericTags` */
  genericMultiplier: number;
  genericTags: Set<string>;
};

const DEFAULT_GENERIC = new Set(
  [
    "muerte",
    "policia",
    "accidente",
    "investigacion",
    "violencia",
    "tragedia",
    "denuncia",
    "crimen",
    "ataque",
    "muerto",
    "muertos",
    "muerta",
    "hombre",
    "mujer",
    "joven",
    "nene",
    "nena",
  ].map((s) => normalizeForMatch(s)),
);

export function parseGenericTagsEnv(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return DEFAULT_GENERIC;
  const set = new Set<string>();
  for (const part of raw.split(",")) {
    const n = normalizeForMatch(part);
    if (n) set.add(n);
  }
  return set.size > 0 ? set : DEFAULT_GENERIC;
}

/** Similitud base 0..1 (sin penalización por tags genéricos). */
function baseSimilarityForTag(
  articleNorm: string,
  tagRaw: string,
  opts: ScoreArticleOptions,
): number {
  const tagNorm = normalizeForMatch(tagRaw);
  if (!tagNorm || tagNorm.length < 2) return 0;

  if (tagNorm.includes(" ") || tagNorm.length >= 8) {
    if (articleNorm.includes(tagNorm)) return 1;
    const words = meaningfulTokensFromNormalizedTag(tagNorm);
    if (words.length === 0) return 0;
    const hits = words.filter((w) => articleNorm.includes(w)).length;
    const ratio = hits / words.length;
    // Para tags de más de un token, exigimos cobertura total (evita falsos positivos
    // como “muerte de menor” por aparecer “menor” en “menor a 15m3”).
    if (words.length >= 2) {
      return hits === words.length ? 1 : 0;
    }
    if (ratio < opts.minSimilarity) return 0;
    return Math.min(1, 0.55 + 0.45 * ratio);
  }

  if (tagNorm.length < 4) return 0;

  if (articleNorm.includes(tagNorm)) return 1;

  const words = meaningfulTokensFromNormalizedTag(tagNorm);
  if (words.length > 0) {
    const hits = words.filter((w) => articleNorm.includes(w)).length;
    const ratio = hits / words.length;
    if (ratio < opts.minSimilarity) return 0;
    return Math.min(1, 0.55 + 0.45 * ratio);
  }

  return 0;
}

export function scoreArticleAgainstLexicon(
  articleText: string,
  lexicon: FrecuenciaTagRow[],
  opts: ScoreArticleOptions,
): ArticleSemantic {
  const articleNorm = normalizeForMatch(articleText);
  if (!articleNorm) {
    return { score: 0, matches: [] };
  }

  const matches: SemanticTagMatch[] = [];
  for (const row of lexicon) {
    const tagNorm = normalizeForMatch(row.tag);
    const base = baseSimilarityForTag(articleNorm, row.tag, opts);
    if (base < opts.minSimilarity) continue;
    const genericMul =
      tagNorm && opts.genericTags.has(tagNorm) ? opts.genericMultiplier : 1;
    const similarity = Math.min(1, base * genericMul);
    const weightedScore = similarity * Math.log1p(row.cantidad);
    matches.push({
      tag: row.tag,
      similarity,
      weightedScore,
    });
  }

  matches.sort((a, b) => b.weightedScore - a.weightedScore);
  const top = matches.slice(0, opts.topMatches);
  const score = top.length > 0 ? top[0]!.weightedScore : 0;
  return { score, matches: top };
}

export function scoreOptionsFromEnv(): ScoreArticleOptions {
  const minSimilarity = Number(
    process.env.SEMANTIC_MIN_SIMILARITY ?? "0.5",
  );
  const topMatches = Number(process.env.SEMANTIC_TOP_MATCHES ?? "5");
  const genericMultiplier = Number(
    process.env.SEMANTIC_GENERIC_MULTIPLIER ?? "0.4",
  );
  const genericTags = parseGenericTagsEnv(process.env.SEMANTIC_GENERIC_TAGS);

  return {
    minSimilarity:
      Number.isFinite(minSimilarity) && minSimilarity > 0 && minSimilarity <= 1
        ? minSimilarity
        : 0.5,
    topMatches:
      Number.isFinite(topMatches) && topMatches > 0 ? topMatches : 5,
    genericMultiplier:
      Number.isFinite(genericMultiplier) &&
      genericMultiplier > 0 &&
      genericMultiplier <= 1
        ? genericMultiplier
        : 0.4,
    genericTags,
  };
}
