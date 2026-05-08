import { decodeHtmlEntities } from "./decodeHtmlEntities.js";

function toTitleCase(words: string[]): string {
  return words
    .map((w) => (w.length <= 2 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Infere un título legible desde la URL (slug). Útil como último fallback cuando el HTML da 403.
 */
export function inferTitleFromUrl(url: string): string | undefined {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const last = path.split("/").filter(Boolean).pop();
  if (!last) return undefined;
  const noExt = last.replace(/\.(html?|php|aspx?)$/i, "");
  const cleaned = noExt
    // recortes típicos: IDs, sufijos tipo _a69fd..., -n1234
    .replace(/_a[0-9a-f]{10,}$/i, "")
    .replace(/-n\d+$/i, "")
    .replace(/-\d{6,}$/i, "")
    .replace(/^\d{4}-\d{1,2}-\d{1,2}-/i, "")
    .replace(/^[a-z]{2,}-\d{1,2}-\d{1,2}-\d{1,2}-/i, "");

  const parts = decodeHtmlEntities(cleaned)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !/^\d+$/.test(w));

  if (parts.length === 0) return undefined;
  return toTitleCase(parts);
}

