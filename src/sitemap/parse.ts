import { XMLParser } from "fast-xml-parser";
import type { ArticleCandidate } from "../types.js";
import { xmlText } from "../utils/text.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

export type ParsedSitemap =
  | { kind: "index"; locations: string[] }
  | { kind: "urlset"; entries: ArticleCandidate[] };

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function extractNewsMeta(news: unknown): {
  title?: string;
  publishedAt?: string;
  keywords?: string;
} {
  if (!news || typeof news !== "object") return {};
  const n = news as Record<string, unknown>;
  const title = xmlText(n.title);
  const publishedAt =
    xmlText(n.publication_date) ??
    xmlText(n.pubDate) ??
    xmlText(n.publicationDate);
  const keywords = xmlText(n.keywords);
  return { title, publishedAt, keywords };
}

export function parseSitemapXml(xml: string): ParsedSitemap {
  const doc = parser.parse(xml) as Record<string, unknown>;

  if (doc.sitemapindex) {
    const idx = doc.sitemapindex as Record<string, unknown>;
    const sm = asArray(idx.sitemap) as Record<string, unknown>[];
    const locations = sm
      .map((s) => xmlText(s["loc"]))
      .filter((u): u is string => Boolean(u));
    return { kind: "index", locations };
  }

  if (doc.urlset) {
    const us = doc.urlset as Record<string, unknown>;
    const urls = asArray(us.url) as Record<string, unknown>[];
    const entries: ArticleCandidate[] = [];
    for (const u of urls) {
      const loc = xmlText(u["loc"]);
      if (!loc) continue;
      const lastmod = xmlText(u["lastmod"]);
      const news = extractNewsMeta(u["news"]);
      const title = news.title ?? loc;
      const publishedAt = news.publishedAt ?? lastmod ?? "";
      entries.push({
        url: loc,
        title,
        publishedAt,
        newsKeywords: news.keywords,
      });
    }
    return { kind: "urlset", entries };
  }

  throw new Error("XML no reconocido como sitemap ni sitemap índice");
}
