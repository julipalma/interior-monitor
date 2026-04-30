import { readFile } from "node:fs/promises";

export type FrecuenciaTagRow = {
  tag: string;
  cantidad: number;
};

function parseFrecuenciaLine(line: string): FrecuenciaTagRow | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("tag_unificado")) return null;
  const c0 = trimmed.indexOf(",");
  if (c0 === -1) return null;
  const c1 = trimmed.indexOf(",", c0 + 1);
  if (c1 === -1) return null;
  const tag = trimmed.slice(0, c0).trim();
  const cantStr = trimmed.slice(c0 + 1, c1).trim();
  const n = Number(cantStr);
  if (!tag || !Number.isFinite(n) || n < 0) return null;
  return { tag, cantidad: n };
}

/** Parsea el CSV `tag_unificado,cantidad,tags_agrupados` (solo usa las dos primeras columnas). */
export function parseFrecuenciaCsv(raw: string): FrecuenciaTagRow[] {
  const out: FrecuenciaTagRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const row = parseFrecuenciaLine(line);
    if (row) out.push(row);
  }
  return out;
}

export async function loadFrecuenciaCsvFile(
  path: string,
): Promise<FrecuenciaTagRow[]> {
  const raw = await readFile(path, "utf8");
  return parseFrecuenciaCsv(raw);
}
