/** Normaliza nodos de fast-xml-parser a string. */
export function xmlText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as object)) {
    const t = (value as { "#text": unknown })["#text"];
    return typeof t === "string" ? t.trim() : String(t);
  }
  return undefined;
}
