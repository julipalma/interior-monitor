import type { MatchedArticle } from "../types.js";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const AR_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3, sin DST

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Formatea una fecha a hora argentina: "mié 27/05 · 13:18"
 * Si el string no se puede parsear, lo devuelve tal cual (mejor que nada).
 */
export function formatPublishedAt(raw: string): string {
  if (!raw) return "sin fecha";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const ar = new Date(d.getTime() + AR_OFFSET_MS);
  const day = ar.getUTCDate();
  const month = ar.getUTCMonth();
  const weekday = ar.getUTCDay();
  const hh = pad2(ar.getUTCHours());
  const mm = pad2(ar.getUTCMinutes());
  return `${DIAS[weekday]} ${pad2(day)}/${pad2(month + 1)} · ${hh}:${mm}`;
}

function formatSemanticLine(m: MatchedArticle): string | undefined {
  const sem = m.semantic;
  if (!sem?.matches?.length) return undefined;
  return sem.matches
    .map((x) => `${x.tag} (${x.weightedScore.toFixed(2)})`)
    .join(", ");
}

/** Una nota: título (con ▶️ [*VIDEO*] si tiene video), fecha, URL y Temas (misma forma para TXT y Slack). */
export function formatArticleBlockLines(m: MatchedArticle): string[] {
  const rawTitle = m.title?.trim() || m.url;
  const title = m.hasVideo ? `▶️ [*VIDEO*] ${rawTitle}` : rawTitle;
  const lines = [title, formatPublishedAt(m.publishedAt || ""), m.url];
  const semLine = formatSemanticLine(m);
  if (semLine) lines.push(`Temas: ${semLine}`);
  return lines;
}

/** Pone las notas con video al principio, el resto mantiene el orden original. */
export function sortVideoFirst(items: MatchedArticle[]): MatchedArticle[] {
  return [
    ...items.filter((m) => m.hasVideo),
    ...items.filter((m) => !m.hasVideo),
  ];
}

/** Agrupa por medio: el nombre del medio una sola vez; notas separadas por ---. */
export function formatGroupedReportTxt(items: MatchedArticle[]): string {
  const order: string[] = [];
  const by = new Map<string, MatchedArticle[]>();
  for (const m of items) {
    if (!by.has(m.sourceName)) {
      order.push(m.sourceName);
      by.set(m.sourceName, []);
    }
    by.get(m.sourceName)!.push(m);
  }
  const blocks: string[] = [];
  for (const name of order) {
    const list = sortVideoFirst(by.get(name)!);
    const articleChunks = list.map((m) => formatArticleBlockLines(m).join("\n"));
    const body = [`*${name}*`, "", articleChunks.join("\n\n---\n\n")];
    blocks.push(body.join("\n").trimEnd());
  }
  return `${blocks.join("\n\n")}\n`;
}
