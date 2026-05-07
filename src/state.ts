import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalArticleUrl } from "./utils/canonicalUrl.js";

const STATE_DIR = process.env.STATE_DIR ?? ".state";
const STATE_FILE = path.join(STATE_DIR, "seen-urls.json");
const HEALTH_STATE_FILE = path.join(STATE_DIR, "health-state.json");

type StateFile = { seen: string[] };
type HealthStateFile = { consecutiveFailuresBySource?: Record<string, number> };

export async function loadSeen(): Promise<Set<string>> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const j = JSON.parse(raw) as StateFile;
    const arr = Array.isArray(j.seen) ? j.seen : [];
    return new Set(arr.map((u) => canonicalArticleUrl(u)));
  } catch {
    return new Set();
  }
}

export async function saveSeen(seen: Set<string>): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  const data: StateFile = { seen: [...seen].sort() };
  await writeFile(STATE_FILE, JSON.stringify(data), "utf8");
}

export async function loadHealthState(): Promise<{
  consecutiveFailuresBySource: Record<string, number>;
}> {
  try {
    const raw = await readFile(HEALTH_STATE_FILE, "utf8");
    const j = JSON.parse(raw) as HealthStateFile;
    return {
      consecutiveFailuresBySource: j.consecutiveFailuresBySource ?? {},
    };
  } catch {
    return { consecutiveFailuresBySource: {} };
  }
}

export async function saveHealthState(state: {
  consecutiveFailuresBySource: Record<string, number>;
}): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(HEALTH_STATE_FILE, JSON.stringify(state), "utf8");
}
