/** Quita diacríticos para comparar texto en español de forma laxa. */
export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Minúsculas, sin acentos, colapsa espacios. */
export function normalizeForMatch(s: string): string {
  const t = stripDiacritics(s.trim().toLowerCase()).replace(/\s+/g, " ");
  return t;
}

const STOP = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "y",
  "a",
  "en",
  "un",
  "una",
  "unos",
  "unas",
  "con",
  "por",
  "del",
  "al",
  "que",
  "se",
  "no",
  "su",
  "lo",
  "le",
  "da",
  "do",
  "o",
]);

/** Palabras del tag útiles para overlap (sin ruido gramatical corto). */
export function meaningfulTokensFromNormalizedTag(tagNorm: string): string[] {
  return tagNorm
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP.has(w));
}
