import type { MatchedArticle } from "../types.js";
import { fetchHtml } from "../sitemap/http.js";
import { mapLimit } from "../utils/mapLimit.js";
import { extractTitleFromHtml } from "./titleFromHtml.js";

export function titleNeedsHtmlFetch(title: string, url: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (t === url) return true;
  if (/^https?:\/\//i.test(t)) return true;
  return false;
}

export async function enrichArticleTitles(
  items: MatchedArticle[],
  concurrency: number,
): Promise<void> {
  const todo = items.filter((m) => titleNeedsHtmlFetch(m.title, m.url));
  const n = Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 3;
  await mapLimit(todo, n, async (m) => {
    try {
      const html = await fetchHtml(m.url);
      const t = extractTitleFromHtml(html);
      if (t) m.title = t;
    } catch {
      /* mantener título del sitemap */
    }
  });
}
