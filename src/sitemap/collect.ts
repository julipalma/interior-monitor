import type { ArticleCandidate, NewsSource } from "../types.js";
import { fetchText } from "./http.js";
import { parseSitemapXml } from "./parse.js";

function dedupeByUrl(entries: ArticleCandidate[]): ArticleCandidate[] {
  const map = new Map<string, ArticleCandidate>();
  for (const e of entries) {
    if (!map.has(e.url)) map.set(e.url, e);
  }
  return [...map.values()];
}

/**
 * Descarga recursivamente sitemaps hijos hasta reunir entradas <url>.
 */
async function collectFromSitemapUrl(url: string): Promise<ArticleCandidate[]> {
  const xml = await fetchText(url);
  const doc = parseSitemapXml(xml);
  if (doc.kind === "urlset") return doc.entries;
  const all: ArticleCandidate[] = [];
  for (const loc of doc.locations) {
    all.push(...(await collectFromSitemapUrl(loc)));
  }
  return all;
}

export async function collectCandidates(
  source: NewsSource,
): Promise<ArticleCandidate[]> {
  const xml = await fetchText(source.sitemapUrl);
  const root = parseSitemapXml(xml);

  if (root.kind === "urlset") {
    return dedupeByUrl(root.entries);
  }

  const combined: ArticleCandidate[] = [];
  for (const loc of root.locations) {
    combined.push(...(await collectFromSitemapUrl(loc)));
  }
  return dedupeByUrl(combined);
}
