import * as cheerio from "cheerio";

/**
 * Decodifica entidades HTML/XML (`&oacute;`, `&#237;`, etc.) en texto plano.
 * Muchos sitemaps traen el `<news:title>` escapado.
 */
export function decodeHtmlEntities(raw: string): string {
  const s = raw.trim();
  if (!s || !/&[#a-zA-Z0-9]+;/.test(s)) return s;
  try {
    const $ = cheerio.load("<div></div>");
    $("div").append(s);
    return $("div").text().trim();
  } catch {
    return s;
  }
}
