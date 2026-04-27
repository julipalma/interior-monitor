import type { MatchedArticle } from "../types.js";

/** Agrupa por medio, conservando el orden de primera aparición. */
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
    const list = by.get(name)!;
    const lines: string[] = [`*${name}*`, ""];
    for (const m of list) {
      lines.push(m.title);
      lines.push(m.publishedAt || "sin fecha");
      lines.push(m.url);
      lines.push("");
    }
    blocks.push(lines.join("\n").trimEnd());
  }
  return `${blocks.join("\n\n")}\n`;
}
