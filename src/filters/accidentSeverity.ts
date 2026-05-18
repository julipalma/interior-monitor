import type { MatchedArticle } from "../types.js";
import { normalizeForMatch } from "../utils/normalizeForMatch.js";

/**
 * Tags que indican accidente vial sin gravedad implícita.
 * Si el tag con mayor score de un artículo es uno de estos,
 * se exige al menos una señal de severidad en el texto disponible.
 * "accidente vial fatal" queda fuera: ya contiene la gravedad.
 */
const ACCIDENT_TRIGGER_TAGS = new Set(
  ["choque", "accidente de transito", "accidente vial"].map(normalizeForMatch),
);

/**
 * Señales que hacen relevante un accidente vial para un noticiero nacional:
 * muertes, heridos graves, vehículos de pasajeros o múltiples víctimas.
 */
const SEVERITY_SIGNALS = [
  // Muertes
  "murio", "murieron", "muerto", "muertos", "muerta", "muertas",
  "fallecio", "fallecida", "fallecidos", "fallecidas", "fallecimiento",
  "sin vida", "perdio la vida", "perdieron la vida",
  // Accidente fatal
  "fatal", "fatales",
  // Heridos graves
  "herido grave", "heridos graves", "herida grave", "heridas graves",
  "herido de gravedad", "heridos de gravedad",
  "herida de gravedad", "heridas de gravedad",
  "gravemente herido", "gravemente herida",
  "lesion grave", "lesiones graves",
  "grave estado", "estado grave", "estado critico",
  // Vehículos de pasajeros (muchos afectados)
  "colectivo", "omnibus",
  // Múltiples víctimas
  "varios heridos", "varios muertos", "varias victimas",
  "multiples victimas", "multiples heridos",
].map(normalizeForMatch);

/**
 * Devuelve true si el artículo es un accidente vial menor que no justifica
 * aparecer en el resumen (ninguna muerte, herido grave ni colectivo involucrado).
 * Solo filtra cuando el mejor tag semántico es un tag de accidente genérico.
 */
export function isMinorAccident(article: MatchedArticle): boolean {
  const topTag = article.semantic?.matches[0]?.tag;
  if (!topTag) return false;
  if (!ACCIDENT_TRIGGER_TAGS.has(normalizeForMatch(topTag))) return false;

  const text = normalizeForMatch(
    [article.title, article.prefetchedText].filter(Boolean).join(" "),
  );
  return !SEVERITY_SIGNALS.some((signal) => text.includes(signal));
}
