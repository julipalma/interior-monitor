import type { MatchedArticle } from "../types.js";
import { normalizeForMatch } from "../utils/normalizeForMatch.js";

/**
 * Señales fuertes de seguimiento judicial en el título.
 * Cualquiera de estas frases sola es suficiente para clasificar la nota
 * como seguimiento de causa y no como hecho puntual.
 */
const JUDICIAL_STRONG_PHRASES = [
  // Proceso judicial en curso
  "juicio oral",
  "inicio del juicio",
  "comenzo el juicio",
  "arranco el juicio",
  "declaro en el juicio",
  "declaro ante el tribunal",
  "declaro ante la justicia",
  "audiencia de",
  "nueva audiencia",
  "elevar a juicio",
  "elevaron a juicio",
  "elevacion a juicio",
  "va a juicio",
  "ira a juicio",
  "llega a juicio",
  // Pedidos del fiscal / defensores en el juicio
  "piden anos de prision",
  "piden prision perpetua",
  "piden la condena",
  "solicitaron la condena",
  "pedido de condena",
  // Actualizaciones genéricas de causa
  "novedades en el caso",
  "novedades sobre el caso",
  "novedades en la causa",
  "avances en el caso",
  "avances en la causa",
  "el caso cada vez",
  "la causa cada vez",
  "cada vez mas complicado",
  "cada vez mas comprometido",
].map(normalizeForMatch);

/**
 * Combinaciones de dos señales que juntas indican seguimiento judicial.
 * Solo filtra si AMBAS están en el título.
 */
const JUDICIAL_COMBO_PAIRS: [string, string][] = [
  // "se confesó" ante la justicia / causa / tribunal (no ante la familia)
  ["se confeso", "la justicia"],
  ["se confeso", "la causa"],
  ["se confeso", "el tribunal"],
  ["confeso ante", "la justicia"],
  // "imputado" que está "complicado" → update de causa
  ["imputado", "complicado"],
  // "enfrentaba una causa" → artículo sobre causa preexistente
  ["enfrentaba", "la causa"],
  ["enfrentaba", "una causa"],
].map(([a, b]) => [normalizeForMatch(a), normalizeForMatch(b)]);

/**
 * Señales que indican un hecho policial nuevo o una detención reciente.
 * Si están presentes, la nota NO se filtra aunque haya señales judiciales.
 */
const NEW_INCIDENT_SIGNALS = [
  // Capturas recientes
  "detuvieron",
  "apresaron",
  "capturaron",
  "cayo preso",
  "fue detenido",
  "fueron detenidos",
  "lo arrestaron",
  // Hallazgos
  "hallaron",
  "encontraron el cuerpo",
  "encontraron muerto",
  "aparecio muerto",
  "aparecio sin vida",
  // Hechos ocurridos ahora
  "balacera",
  "tiroteo",
  "robo a mano armada",
  "entraderas",
  "asaltaron",
  "atacaron",
  "golpearon",
  "acuchillaron",
  "balearon",
  "asesinaron",
  "mataron",
].map(normalizeForMatch);

/**
 * Devuelve true si el artículo trata sobre un seguimiento judicial
 * (novedades de causa, juicio oral, declaraciones en tribunales, etc.)
 * y no sobre un hecho policial puntual.
 *
 * Solo filtra cuando las señales son claras para minimizar falsos positivos.
 * Los veredictos ("condenaron", "absolvieron") y las detenciones se CONSERVAN.
 */
export function isJudicialFollowup(article: MatchedArticle): boolean {
  const titleNorm = normalizeForMatch(article.title ?? "");
  if (!titleNorm) return false;

  // Si hay señales de hecho nuevo → no filtrar
  if (NEW_INCIDENT_SIGNALS.some((s) => titleNorm.includes(s))) return false;

  // Señal fuerte única → es seguimiento
  if (JUDICIAL_STRONG_PHRASES.some((phrase) => titleNorm.includes(phrase))) {
    return true;
  }

  // Combinación de dos señales más suaves → es seguimiento
  if (JUDICIAL_COMBO_PAIRS.some(([a, b]) => titleNorm.includes(a) && titleNorm.includes(b))) {
    return true;
  }

  return false;
}
