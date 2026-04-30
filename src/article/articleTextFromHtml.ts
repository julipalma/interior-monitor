import * as cheerio from "cheerio";
import { extractTitleFromHtml } from "./titleFromHtml.js";

function metaContent(
  $: cheerio.CheerioAPI,
  selector: string,
): string | undefined {
  const v = $(selector).attr("content");
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/**
 * Texto compacto para alinear con tags: título, descripción, keywords y primeros párrafos.
 */
export function buildArticleTextForScoring(
  html: string,
  titleFallback: string,
): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];

  const title = extractTitleFromHtml(html) ?? titleFallback;
  if (title.trim()) parts.push(title.trim());

  const ogDesc = metaContent($, 'meta[property="og:description"]');
  const metaDesc = metaContent($, 'meta[name="description"]');
  const desc = ogDesc ?? metaDesc;
  if (desc) parts.push(desc);

  const kw = metaContent($, 'meta[name="keywords"]');
  if (kw) parts.push(kw);

  const seen = new Set<string>();
  $(
    'article p, [role="main"] p, main p, .article-body p, .entry-content p',
  )
    .slice(0, 12)
    .each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t.length < 35) return;
      const key = t.slice(0, 80);
      if (seen.has(key)) return;
      seen.add(key);
      parts.push(t);
    });

  if (parts.length === 1) {
    $("p")
      .slice(0, 8)
      .each((_, el) => {
        const t = $(el).text().replace(/\s+/g, " ").trim();
        if (t.length < 40) return;
        parts.push(t);
      });
  }

  return parts.join("\n").slice(0, 14_000);
}
