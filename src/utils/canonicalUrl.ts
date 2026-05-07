/**
 * Clave estable para deduplicar la misma noticia entre corridas cuando el sitemap
 * u orígenes devuelven variantes (slash final, mayúsculas en host, fragmento, orden de query).
 */
export function canonicalArticleUrl(urlString: string): string {
  const trimmed = urlString.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }

  u.hash = "";
  u.hostname = u.hostname.toLowerCase();

  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  u.pathname = path;

  if (
    (u.protocol === "https:" && u.port === "443") ||
    (u.protocol === "http:" && u.port === "80")
  ) {
    u.port = "";
  }

  if (u.search && u.search.length > 1) {
    const params = new URLSearchParams(u.search);
    const sorted = new URLSearchParams(
      [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    );
    u.search = sorted.toString();
  }

  return u.toString();
}
