import type { ArticleSemantic, SemanticTagMatch } from "../types.js";
import type { FrecuenciaTagRow } from "../tags/loadFrecuenciaCsv.js";
import type { ScoreArticleOptions } from "../tags/scoreArticle.js";
import { normalizeForMatch } from "../utils/normalizeForMatch.js";

type EmbeddingItem = { tag: string; cantidad: number; vector: number[] };

export type HybridTagger = (
  articleText: string,
  lexical: ArticleSemantic,
) => Promise<ArticleSemantic>;

export type HybridRuntime = {
  tagger: HybridTagger | null;
  minInterestScore: number;
  requireMatch: boolean;
};

type HybridConfig = {
  mode: "lexical" | "hybrid";
  apiKey?: string;
  baseUrl: string;
  embeddingModel: string;
  llmModel: string;
  embedTopK: number;
  embedMinSimilarity: number;
};

function numberFromEnv(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? String(fallback));
  return Number.isFinite(n) ? n : fallback;
}

function getHybridConfigFromEnv(): HybridConfig {
  const mode =
    process.env.SEMANTIC_MODE?.trim().toLowerCase() === "hybrid"
      ? "hybrid"
      : "lexical";
  return {
    mode,
    apiKey: process.env.OPENAI_API_KEY?.trim(),
    baseUrl:
      process.env.OPENAI_BASE_URL?.trim() ?? "https://api.openai.com/v1",
    embeddingModel:
      process.env.SEMANTIC_EMBEDDING_MODEL?.trim() ?? "text-embedding-3-small",
    llmModel: process.env.SEMANTIC_LLM_MODEL?.trim() ?? "gpt-4o-mini",
    embedTopK: Math.max(3, Math.floor(numberFromEnv("SEMANTIC_EMBED_TOP_K", 12))),
    embedMinSimilarity: Math.max(
      0,
      Math.min(1, numberFromEnv("SEMANTIC_EMBED_MIN_SIMILARITY", 0.2)),
    ),
  };
}

async function openAiJson(
  path: string,
  body: Record<string, unknown>,
  cfg: HybridConfig,
): Promise<unknown> {
  if (!cfg.apiKey) throw new Error("OPENAI_API_KEY no definido");
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as unknown;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  if (den === 0) return 0;
  return dot / den;
}

async function embedTexts(
  inputs: string[],
  cfg: HybridConfig,
): Promise<number[][]> {
  const data = (await openAiJson(
    "/embeddings",
    { model: cfg.embeddingModel, input: inputs },
    cfg,
  )) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const out = data.data?.map((d) => d.embedding ?? []) ?? [];
  if (out.length !== inputs.length) {
    throw new Error("Respuesta de embeddings incompleta");
  }
  return out;
}

function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return "{}";
  return raw.slice(start, end + 1);
}

async function llmChooseTags(
  articleText: string,
  candidates: EmbeddingItem[],
  cfg: HybridConfig,
): Promise<{ tags: string[]; confidence: number; reason: string }> {
  const candidateLines = candidates
    .map((c) => `- ${c.tag} (frecuencia=${c.cantidad})`)
    .join("\n");
  const prompt = [
    "Sos analista editorial policial en Argentina.",
    "Decidí si la nota se alinea con estos temas de alto rendimiento.",
    "Reglas: devolver solo temas realmente centrales de la nota, no menciones laterales.",
    "Si no hay ninguno, devolver lista vacía.",
    "",
    "Temas candidatos:",
    candidateLines,
    "",
    "Nota:",
    articleText.slice(0, 7000),
    "",
    'Respondé SOLO JSON con forma: {"tags":["..."],"confidence":0..1,"reason":"..."}',
  ].join("\n");

  const data = (await openAiJson(
    "/chat/completions",
    {
      model: cfg.llmModel,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    },
    cfg,
  )) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { tags?: unknown; confidence?: unknown; reason?: unknown } = {};
  try {
    parsed = JSON.parse(extractJsonObject(content));
  } catch {
    parsed = {};
  }
  const tags =
    Array.isArray(parsed.tags)
      ? parsed.tags.filter((x): x is string => typeof x === "string")
      : [];
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.6;
  const reason = typeof parsed.reason === "string" ? parsed.reason : "";
  return { tags, confidence, reason };
}

function mergeScores(
  selectedTags: string[],
  confidence: number,
  lexical: ArticleSemantic,
  embedScores: Map<string, number>,
  lexiconMap: Map<string, FrecuenciaTagRow>,
  scoreOpts: ScoreArticleOptions,
): ArticleSemantic {
  const lexicalByTag = new Map(
    lexical.matches.map((m) => [normalizeForMatch(m.tag), m]),
  );
  const out: SemanticTagMatch[] = [];
  for (const rawTag of selectedTags) {
    const key = normalizeForMatch(rawTag);
    if (!key) continue;
    const row = lexiconMap.get(key);
    if (!row) continue;
    const lexicalSim = lexicalByTag.get(key)?.similarity ?? 0;
    const embedSim = Math.max(0, embedScores.get(key) ?? 0);
    const similarity = Math.min(1, Math.max(lexicalSim, embedSim) * confidence);
    if (similarity < scoreOpts.minSimilarity) continue;
    out.push({
      tag: row.tag,
      similarity,
      weightedScore: similarity * Math.log1p(row.cantidad),
    });
  }
  out.sort((a, b) => b.weightedScore - a.weightedScore);
  const matches = out.slice(0, scoreOpts.topMatches);
  return {
    score: matches.reduce((sum, m) => sum + m.weightedScore, 0),
    matches,
  };
}

export async function createHybridRuntime(
  lexicon: FrecuenciaTagRow[] | null,
  scoreOpts: ScoreArticleOptions,
): Promise<HybridRuntime> {
  const minInterestScore = numberFromEnv("SEMANTIC_MIN_INTEREST_SCORE", 4.0);
  const requireMatch = process.env.SEMANTIC_REQUIRE_MATCH !== "0";
  const cfg = getHybridConfigFromEnv();
  if (!lexicon || lexicon.length === 0) {
    return { tagger: null, minInterestScore, requireMatch };
  }
  if (cfg.mode !== "hybrid") {
    return { tagger: null, minInterestScore, requireMatch };
  }
  if (!cfg.apiKey) {
    console.error("[semantic] SEMANTIC_MODE=hybrid sin OPENAI_API_KEY; uso lexical.");
    return { tagger: null, minInterestScore, requireMatch };
  }

  const lexiconMap = new Map(
    lexicon.map((r) => [normalizeForMatch(r.tag), r] as const),
  );
  const tagEmbedsRaw = await embedTexts(
    lexicon.map((r) => r.tag),
    cfg,
  );
  const tagEmbeds: EmbeddingItem[] = lexicon.map((r, i) => ({
    tag: r.tag,
    cantidad: r.cantidad,
    vector: tagEmbedsRaw[i] ?? [],
  }));

  const tagger: HybridTagger = async (articleText, lexical) => {
    const [articleVec] = await embedTexts([articleText.slice(0, 7000)], cfg);
    const ranked = tagEmbeds
      .map((t) => ({
        ...t,
        similarity: cosine(articleVec ?? [], t.vector),
      }))
      .filter((x) => x.similarity >= cfg.embedMinSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, cfg.embedTopK);

    if (ranked.length === 0) return { score: 0, matches: [] };
    const chosen = await llmChooseTags(articleText, ranked, cfg);
    const embedScores = new Map(
      ranked.map((x) => [normalizeForMatch(x.tag), x.similarity] as const),
    );
    const semantic = mergeScores(
      chosen.tags,
      chosen.confidence,
      lexical,
      embedScores,
      lexiconMap,
      scoreOpts,
    );
    return semantic;
  };

  console.error(
    `[semantic] híbrido activo (${cfg.embeddingModel} + ${cfg.llmModel})`,
  );
  return { tagger, minInterestScore, requireMatch };
}
