import { XMLParser } from "fast-xml-parser";
import type { ArticleCandidate } from "../types.js";
import { decodeHtmlEntities } from "../utils/decodeHtmlEntities.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function textOf(x: unknown): string | undefined {
  if (typeof x === "string") return x;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o["#text"] === "string") return o["#text"];
    if (typeof o["__cdata"] === "string") return o["__cdata"];
  }
  return undefined;
}

function stripHtmlToText(html: string): string {
  // RSS description suele traer HTML. Queremos algo usable para scoring sin dependencias.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parser laxo para RSS 2.0 y Atom. Devuelve candidatos con publishedAt si existe.
 */
export function parseRssXml(xml: string): ArticleCandidate[] {
  const doc = parser.parse(xml) as Record<string, unknown>;

  // RSS 2.0: rss.channel.item[]
  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const items = asArray(channel?.item as unknown) as Array<Record<string, unknown>>;
  if (items.length > 0) {
    const out: ArticleCandidate[] = [];
    for (const it of items) {
      const link = (textOf(it.link) ?? "").trim();
      if (!link) continue;
      const title = decodeHtmlEntities((textOf(it.title) ?? link).trim());
      const pub = (textOf(it.pubDate) ?? textOf(it.published) ?? "").trim();
      const categories = asArray(it.category as unknown)
        .map((c) => (textOf(c) ?? "").trim())
        .filter(Boolean);
      const descRaw =
        (textOf(it["content:encoded"]) ?? textOf(it.content) ?? textOf(it.description) ?? "").trim();
      const prefetchedText = descRaw ? stripHtmlToText(descRaw) : undefined;
      out.push({
        url: link,
        title,
        publishedAt: pub,
        newsKeywords: categories.length > 0 ? categories.join(",") : undefined,
        prefetchedText,
      });
    }
    return out;
  }

  // Atom: feed.entry[]
  const feed = doc.feed as Record<string, unknown> | undefined;
  const entries = asArray(feed?.entry as unknown) as Array<Record<string, unknown>>;
  if (entries.length > 0) {
    const out: ArticleCandidate[] = [];
    for (const e of entries) {
      let href = "";
      const linkNode = e.link as unknown;
      if (typeof linkNode === "string") href = linkNode;
      else if (linkNode && typeof linkNode === "object") {
        const ln = linkNode as Record<string, unknown>;
        if (typeof ln["@_href"] === "string") href = ln["@_href"];
      }
      href = href.trim();
      if (!href) continue;
      const title = decodeHtmlEntities((textOf(e.title) ?? href).trim());
      const pub = (textOf(e.updated) ?? textOf(e.published) ?? "").trim();
      const categories = asArray(e.category as unknown)
        .map((c) => {
          if (c && typeof c === "object") {
            const o = c as Record<string, unknown>;
            if (typeof o["@_term"] === "string") return o["@_term"];
          }
          return textOf(c) ?? "";
        })
        .map((s) => String(s).trim())
        .filter(Boolean);
      const summaryRaw = (textOf(e.summary) ?? textOf(e.content) ?? "").trim();
      const prefetchedText = summaryRaw ? stripHtmlToText(summaryRaw) : undefined;
      out.push({
        url: href,
        title,
        publishedAt: pub,
        newsKeywords: categories.length > 0 ? categories.join(",") : undefined,
        prefetchedText,
      });
    }
    return out;
  }

  throw new Error("XML no reconocido como RSS/Atom");
}

