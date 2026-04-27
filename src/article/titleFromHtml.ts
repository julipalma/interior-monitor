import * as cheerio from "cheerio";

function metaContent($: cheerio.CheerioAPI, selector: string): string | undefined {
  const v = $(selector).attr("content");
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function headlineFromJsonLdNode(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const h = headlineFromJsonLdNode(n);
      if (h) return h;
    }
    return undefined;
  }
  if (typeof node !== "object") return undefined;
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  const typeStrs: string[] = Array.isArray(t)
    ? t.filter((x): x is string => typeof x === "string")
    : typeof t === "string"
      ? [t]
      : [];
  const isNewsish = typeStrs.some((s) =>
    /NewsArticle|News|Article|BlogPosting|ReportageArticle|WebPage/i.test(s),
  );
  if (isNewsish) {
    for (const key of ["headline", "name"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  for (const k of Object.keys(o)) {
    const h = headlineFromJsonLdNode(o[k]);
    if (h) return h;
  }
  return undefined;
}

function headlineFromJsonLdScripts($: cheerio.CheerioAPI): string | undefined {
  let out: string | undefined;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (out) return;
    const raw = $(el).html();
    if (!raw?.trim()) return;
    try {
      out = headlineFromJsonLdNode(JSON.parse(raw) as unknown);
    } catch {
      /* inválido */
    }
  });
  return out;
}

/** Título legible para mostrar; prioriza OG / JSON-LD / <title>. */
export function extractTitleFromHtml(html: string): string | undefined {
  const $ = cheerio.load(html);
  const og = metaContent($, 'meta[property="og:title"]');
  if (og) return og;
  const tw = metaContent($, 'meta[name="twitter:title"]');
  if (tw) return tw;
  const fromLd = headlineFromJsonLdScripts($);
  if (fromLd) return fromLd;
  const t = $("title").first().text().trim();
  if (t) return t;
  return undefined;
}
