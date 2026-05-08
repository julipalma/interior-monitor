import type { NewsSource } from "../types.js";
import { extractEditorialContentFromHtml } from "./articleContentFromHtml.js";

/**
 * Texto compacto para alinear con tags: título + bajada + cuerpo editorial.
 *
 * Importante: NO incluye keywords, JSON-LD ni módulos de “relacionadas”.
 */
export function buildArticleTextForScoring(
  html: string,
  titleFallback: string,
  sourceContent?: NewsSource["content"],
): string {
  const c = extractEditorialContentFromHtml(html, titleFallback, sourceContent);
  const parts = [c.title, c.dek, c.body].map((s) => s.trim()).filter(Boolean);
  return parts.join("\n").slice(0, 14_000);
}
