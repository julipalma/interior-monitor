import * as cheerio from "cheerio";
import type { ArticleCandidate, DetectionConfig } from "../types.js";
import { fetchHtml } from "../sitemap/http.js";

function pathnameOf(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function walkJsonLd(node: unknown, sections: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) walkJsonLd(n, sections);
    return;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    const sec = o.articleSection;
    if (typeof sec === "string") sections.push(sec);
    else if (Array.isArray(sec)) {
      for (const s of sec) {
        if (typeof s === "string") sections.push(s);
      }
    }
    for (const k of Object.keys(o)) walkJsonLd(o[k], sections);
  }
}

function articleSectionsFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw?.trim()) return;
    try {
      walkJsonLd(JSON.parse(raw) as unknown, out);
    } catch {
      /* JSON inválido en página */
    }
  });
  return out;
}

export async function articleMatchesDetection(
  candidate: ArticleCandidate,
  detection: DetectionConfig,
): Promise<boolean> {
  switch (detection.kind) {
    case "url_path": {
      const path = pathnameOf(candidate.url);
      if (!path) return false;
      const p = path.toLowerCase();
      return detection.fragments.some((f) => p.includes(f.toLowerCase()));
    }
    case "url_suffix": {
      const path = pathnameOf(candidate.url);
      if (!path) return false;
      const normalized = path.replace(/\/+$/, "").toLowerCase();
      const suf = detection.suffix.toLowerCase();
      return normalized.endsWith(suf);
    }
    case "news_keywords": {
      const k = (candidate.newsKeywords ?? "").toLowerCase();
      if (!k) return false;
      return detection.fragments.some((f) => k.includes(f.toLowerCase()));
    }
    case "html_badge": {
      const html = await fetchHtml(candidate.url);
      const $ = cheerio.load(html);
      let found = false;
      $("a.badge-categoria").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (href.includes(detection.hrefContains)) found = true;
      });
      return found;
    }
    case "json_ld_article_section": {
      const html = await fetchHtml(candidate.url);
      const sections = articleSectionsFromHtml(html).map((s) => s.toLowerCase());
      const want = detection.sections.map((s) => s.toLowerCase());
      return sections.some((s) => want.some((w) => s.includes(w)));
    }
  }
}
