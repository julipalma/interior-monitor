import { normalizeForMatch } from "../utils/normalizeForMatch.js";

// ── Detección por título ──────────────────────────────────────────────────────

/**
 * Frases exactas (normalizadas) que indican video en el título.
 * Cubre medios argentinos: LM Neuquén, La Nueva, Misiones Online, etc.
 */
const VIDEO_TITLE_PHRASES = [
  "quedo filmado",
  "quedo grabado",
  "todo quedo filmado",
  "todo quedo grabado",
  "asi quedo filmado",
  "asi quedo grabado",
  "capto la camara",
  "captaron las camaras",
  "captaron las imagenes",
  "mira el video",
  "el video del",
  "el video de la",
  "el video que",
  "el video donde",
  "el impactante video",
  "video muestra",
].map(normalizeForMatch);

/**
 * Devuelve true si el título indica que la nota contiene video.
 * No requiere fetch del HTML.
 */
export function hasVideoFromTitle(title: string): boolean {
  if (!title) return false;
  const norm = normalizeForMatch(title);

  // "Video: así detuvieron..." / "VIDEO. El desencadenante..." / "Video | ..."
  if (/^video[\s.:|]/.test(norm)) return true;

  // "el video clave que...", "el video exclusivo que...", etc.
  if (/\bel video \w+ que\b/.test(norm)) return true;

  // Frases específicas dentro del título
  return VIDEO_TITLE_PHRASES.some((phrase) => norm.includes(phrase));
}

// ── Detección por HTML ────────────────────────────────────────────────────────

/**
 * Devuelve true si el HTML de la nota contiene un reproductor de video embebido.
 * Detecta los patrones conocidos de los medios monitoreados:
 *
 * - CMS Thinkindot (LM Neuquén, La Capital): `class="embed_cont type_video"` o
 *   `data-td-src-property` con `tipo=video`
 * - AMP + Dailymotion (El Día, La Nueva): `<amp-dailymotion` o
 *   `geo.dailymotion.com/player` en amp-iframe src
 * - YouTube embed en cualquier iframe/amp-youtube/script
 * - Tag nativo `<video` con src
 */
export function hasVideoFromHtml(html: string): boolean {
  if (!html) return false;

  // CMS Thinkindot: bloque de tipo video
  if (/class="embed_cont type_video"/.test(html)) return true;
  if (/data-td-src-property="[^"]*tipo=video/.test(html)) return true;

  // AMP Dailymotion
  if (/<amp-dailymotion[\s>]/i.test(html)) return true;
  if (/geo\.dailymotion\.com\/player/i.test(html)) return true;

  // AMP YouTube
  if (/<amp-youtube[\s>]/i.test(html)) return true;

  // YouTube embed en iframe (src directo o lazy).
  // Requiere ID alfanumérico real después de /embed/ para evitar falsos positivos
  // con placeholders de template como ${videoID} (ej. El Liberal).
  if (/(?:data-td-src-property|src)="[^"]*youtube\.com\/embed\/[a-zA-Z0-9_-]+/i.test(html)) return true;

  // Tag nativo <video con atributo src real (no placeholder)
  if (/<video[^>]+src="https?:\/\//i.test(html)) return true;

  // JW Player o Brightcove
  if (/jwplayer\s*\(/.test(html)) return true;
  if (/brightcove\.net/i.test(html)) return true;

  return false;
}
