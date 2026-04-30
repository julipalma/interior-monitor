import type { MatchedArticle } from "../types.js";
import { enrichMatchedArticlesFromHtml } from "./enrichFromHtml.js";

export { titleNeedsHtmlFetch } from "./titleNeeds.js";

export async function enrichArticleTitles(
  items: MatchedArticle[],
  concurrency: number,
): Promise<void> {
  await enrichMatchedArticlesFromHtml(items, concurrency, {});
}
