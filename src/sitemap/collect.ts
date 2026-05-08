import type { ArticleCandidate, NewsSource } from "../types.js";
import { canonicalArticleUrl } from "../utils/canonicalUrl.js";
import { fetchHtml, fetchText } from "./http.js";
import { parseSitemapXml } from "./parse.js";
import * as cheerio from "cheerio";
import { parseRssXml } from "../rss/parse.js";

function dedupeByUrl(entries: ArticleCandidate[]): ArticleCandidate[] {
  const map = new Map<string, ArticleCandidate>();
  for (const e of entries) {
    const key = canonicalArticleUrl(e.url);
    if (!map.has(key)) map.set(key, e);
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
  const spec = source.candidates ?? { kind: "sitemap" as const, url: source.sitemapUrl };

  if (spec.kind === "rss") {
    const xml = await fetchText(spec.url);
    const entries = parseRssXml(xml).map((e) => {
      // Misiones Online: algunos policiales llegan sin categoría “seguridad/policiales”,
      // pero sí con una URL bajo el árbol temático policial/judicial.
      if (
        source.id === "misiones-online" &&
        e.url.startsWith(
          "https://misionesonline.net/tema/policiales-judiciales/policiales/",
        )
      ) {
        const k = (e.newsKeywords ?? "").trim();
        const merged = k ? `${k},policiales` : "policiales";
        return { ...e, newsKeywords: merged };
      }
      return e;
    });
    return dedupeByUrl(entries);
  }

  if (spec.kind === "front") {
    const html = await fetchHtml(spec.url);
    const $ = cheerio.load(html);
    const classSet = new Set(spec.linkContainerClassAnyOf.map((s) => s.trim()).filter(Boolean));
    const out: ArticleCandidate[] = [];

    // Tomar <a> que estén contenidos dentro de un nodo que tenga alguna clase de interés.
    $("a[href]").each((_, el) => {
      const hrefRaw = $(el).attr("href");
      if (!hrefRaw) return;
      const href = hrefRaw.trim();
      // contenedor: el mismo <a> o alguno de sus padres
      let ok = false;
      let cur: cheerio.Cheerio<cheerio.Element> = $(el);
      for (let i = 0; i < 6; i += 1) {
        const cls = (cur.attr("class") ?? "").split(/\s+/).filter(Boolean);
        if (cls.some((c) => classSet.has(c))) {
          ok = true;
          break;
        }
        const parent = cur.parent();
        if (!parent || parent.length === 0) break;
        cur = parent;
      }
      if (!ok) return;

      let url = href;
      try {
        url = new URL(href, spec.url).toString();
      } catch {
        return;
      }
      const text = $(el).text().replace(/\s+/g, " ").trim();
      out.push({ url, title: text || url, publishedAt: "" });
    });

    return dedupeByUrl(out);
  }

  // sitemap (default)
  const xml = await fetchText(spec.url);
  const root = parseSitemapXml(xml);

  if (root.kind === "urlset") return dedupeByUrl(root.entries);
  const combined: ArticleCandidate[] = [];
  for (const loc of root.locations) combined.push(...(await collectFromSitemapUrl(loc)));
  return dedupeByUrl(combined);
}
