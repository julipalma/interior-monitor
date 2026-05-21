import type { MatchedArticle } from "../types.js";

function formatSemanticLine(m: MatchedArticle): string | undefined {
  const sem = m.semantic;
  if (!sem?.matches?.length) return undefined;
  return sem.matches
    .map((x) => `${x.tag} (${x.weightedScore.toFixed(2)})`)
    .join(", ");
}

/** Una nota: título (con ▶️ si tiene video), fecha, URL y Temas (misma forma para TXT y Slack). */
export function formatArticleBlockLines(m: MatchedArticle): string[] {
  const rawTitle = m.title?.trim() || m.url;
  const title = m.hasVideo ? `▶️ [VIDEO] ${rawTitle}` : rawTitle;
  const lines = [title, m.publishedAt || "sin fecha", m.url];
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
