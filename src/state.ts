import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE_DIR = process.env.STATE_DIR ?? ".state";
const STATE_FILE = path.join(STATE_DIR, "seen-urls.json");

type StateFile = { seen: string[] };

export async function loadSeen(): Promise<Set<string>> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const j = JSON.parse(raw) as StateFile;
    return new Set(Array.isArray(j.seen) ? j.seen : []);
  } catch {
    return new Set();
  }
}

export async function saveSeen(seen: Set<string>): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  const data: StateFile = { seen: [...seen].sort() };
  await writeFile(STATE_FILE, JSON.stringify(data), "utf8");
}
