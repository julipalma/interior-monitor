/** Indica si conviene abrir el HTML para obtener un título legible. */
export function titleNeedsHtmlFetch(title: string, url: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (t === url) return true;
  if (/^https?:\/\//i.test(t)) return true;
  return false;
}
