import * as cheerio from "cheerio";
import { extractTitleFromHtml } from "./titleFromHtml.js";

export type ArticleContentHints = {
  rootSelectors?: string[];
  excludeSelectors?: string[];
};

export type ExtractedArticleContent = {
  title: string;
  dek: string;
  body: string;
};

function metaContent(
  $: cheerio.CheerioAPI,
  selector: string,
): string | undefined {
  const v = $(selector).attr("content");
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function paragraphLinkDensity($p: cheerio.Cheerio<cheerio.Element>): number {
  const total = normalizeWhitespace($p.text()).length;
  if (total === 0) return 0;
  const linkLen = normalizeWhitespace($p.find("a").text()).length;
  return Math.min(1, linkLen / total);
}

function isLikelyRelatedOrNavText(t: string): boolean {
  const s = normalizeWhitespace(t).toLowerCase();
  if (!s) return true;
  return (
    s === "cerrar" ||
    s === "x" ||
    s === "te podria interesar" ||
    s === "te podría interesar" ||
    s === "ultimas noticias" ||
    s === "últimas noticias" ||
    s === "comparti esta nota:" ||
    s === "compartí esta nota:" ||
    s === "comparti esta nota" ||
    s === "compartí esta nota" ||
    s === "no disponible sin conexion" ||
    s === "no disponible sin conexión" ||
    s === "¿que opinion tenes sobre esta nota?" ||
    s === "¿qué opinión tenés sobre esta nota?" ||
    s.includes("¿queres mantenerte informado?") ||
    s.includes("¿querés mantenerte informado?") ||
    s.includes("suscribite a nuestros") ||
    s.includes("sumate aca") ||
    s.includes("sumate acá")
  );
}

function isStopSectionMarker(t: string): boolean {
  const s = normalizeWhitespace(t).toLowerCase();
  if (!s) return false;
  return (
    s === "te puede interesar" ||
    s === "te podria interesar" ||
    s === "te podría interesar" ||
    s === "ultimas noticias" ||
    s === "últimas noticias" ||
    s.startsWith("comparti esta nota") ||
    s.startsWith("compartí esta nota") ||
    s.startsWith("¿que opinion tenes") ||
    s.startsWith("¿qué opinión tenés")
  );
}

function baseExcludeSelectors(): string[] {
  return [
    "script",
    "style",
    "noscript",
    "svg",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "nav",
    "aside",
    "footer",
    "header",
    '[role="navigation"]',
    '[aria-label*="share" i]',
    '[class*="share" i]',
    '[class*="social" i]',
    '[class*="newsletter" i]',
    '[class*="suscrib" i]',
    '[class*="subscribe" i]',
    '[class*="related" i]',
    '[class*="relacion" i]',
    '[class*="recomend" i]',
    '[class*="more" i]',
    '[class*="tag" i] a',
  ];
}

function scoreRoot($: cheerio.CheerioAPI, $root: cheerio.Cheerio<cheerio.Element>): number {
  const ps = $root.find("p");
  if (ps.length === 0) return 0;
  let score = 0;
  let goodParas = 0;
  ps.each((_, el) => {
    const $p = $(el);
    const txt = normalizeWhitespace($p.text());
    if (txt.length < 40) return;
    if (isLikelyRelatedOrNavText(txt)) return;
    const ld = paragraphLinkDensity($p);
    if (ld > 0.65 && txt.length < 200) return;
    goodParas += 1;
    score += Math.min(500, txt.length) * (1 - ld);
  });
  if (goodParas < 2) return 0;
  return score;
}

function pickBestRoot($: cheerio.CheerioAPI, hints?: ArticleContentHints): cheerio.Cheerio<cheerio.Element> | null {
  const preferred = hints?.rootSelectors?.filter(Boolean) ?? [];
  const candidates = [
    ...preferred,
    '[itemprop="articleBody"]',
    "article",
    'main article',
    '[role="main"] article',
    "main",
    '[role="main"]',
    ".article-body",
    ".entry-content",
    ".post-content",
    ".content",
  ];

  let best: cheerio.Cheerio<cheerio.Element> | null = null;
  let bestScore = 0;
  for (const sel of candidates) {
    const $els = $(sel);
    if ($els.length === 0) continue;
    $els.each((_, el) => {
      const $root = $(el);
      const sc = scoreRoot($, $root);
      if (sc > bestScore) {
        bestScore = sc;
        best = $root;
      }
    });
    if (bestScore > 5000) break;
  }
  return best;
}

function collectBodyText($: cheerio.CheerioAPI, $root: cheerio.Cheerio<cheerio.Element>): string {
  const lines: string[] = [];
  $root.find("p, h2, h3, li").each((_, el) => {
    const $el = $(el);
    const txt = normalizeWhitespace($el.text());
    if (isStopSectionMarker(txt)) return false; // cortar: a partir de acá suele ser “relacionadas”
    if (txt.length < 35) return;
    if (isLikelyRelatedOrNavText(txt)) return;
    const ld = el.tagName === "p" ? paragraphLinkDensity($el as any) : 0;
    if (ld > 0.65 && txt.length < 220) return;
    lines.push(txt);
  });
  return lines.join("\n").slice(0, 14_000);
}

/**
 * Extrae contenido editorial (título + bajada + cuerpo) minimizando contaminación de “relacionadas”.
 */
export function extractEditorialContentFromHtml(
  html: string,
  titleFallback: string,
  hints?: ArticleContentHints,
): ExtractedArticleContent {
  const $ = cheerio.load(html);

  const title = (extractTitleFromHtml(html) ?? titleFallback).trim();
  const ogDesc = metaContent($, 'meta[property="og:description"]');
  const metaDesc = metaContent($, 'meta[name="description"]');
  const dek = normalizeWhitespace(ogDesc ?? metaDesc ?? "");

  const $root = pickBestRoot($, hints);
  if ($root) {
    const excludes = [...baseExcludeSelectors(), ...(hints?.excludeSelectors ?? [])];
    for (const sel of excludes) $root.find(sel).remove();
    const body = collectBodyText($, $root);
    return { title, dek, body };
  }

  return { title, dek, body: "" };
}

