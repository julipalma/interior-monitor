import { readFile, writeFile } from "node:fs/promises";
import type { MatchedArticle } from "../types.js";

export type FeedItem = {
  url: string;
  titulo_original: string;
  fuente: string;
  fecha_publicacion: string;
  relevancia: number;
  cuerpo?: string;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SCORE = 25;

function toLocalIso(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  // Devuelve formato sin zona horaria (igual al ejemplo del enunciado)
  return d.toISOString().replace("Z", "").slice(0, 19);
}

function computeRelevancia(article: MatchedArticle, maxScore: number): number {
  const score = article.semantic?.score ?? 0;
  return Math.round(Math.min(score / maxScore, 1) * 100) / 100;
}

export function buildFeedItems(
  articles: MatchedArticle[],
  maxScore = DEFAULT_MAX_SCORE,
): FeedItem[] {
  return articles.map((m) => ({
    url: m.url,
    titulo_original: m.title,
    fuente: m.sourceName,
    fecha_publicacion: toLocalIso(m.publishedAt),
    relevancia: computeRelevancia(m, maxScore),
    ...(m.body ? { cuerpo: m.body } : {}),
  }));
}

export async function loadJsonFeed(path: string): Promise<FeedItem[]> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as FeedItem[];
    return [];
  } catch {
    return [];
  }
}

export function mergeFeed(existing: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  const now = Date.now();
  const cutoff = now - SEVEN_DAYS_MS;
  const seen = new Set<string>();
  const merged: FeedItem[] = [];

  for (const item of [...incoming, ...existing]) {
    if (seen.has(item.url)) continue;
    const ts = Date.parse(item.fecha_publicacion);
    if (Number.isFinite(ts) && ts < cutoff) continue;
    seen.add(item.url);
    merged.push(item);
  }

  // Orden: más nueva primero
  merged.sort((a, b) => {
    const ta = Date.parse(a.fecha_publicacion);
    const tb = Date.parse(b.fecha_publicacion);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  return merged;
}

export async function saveJsonFeed(path: string, items: FeedItem[]): Promise<void> {
  await writeFile(path, JSON.stringify(items, null, 2), "utf8");
}
