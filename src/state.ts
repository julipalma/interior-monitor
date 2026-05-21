import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalArticleUrl } from "./utils/canonicalUrl.js";

const STATE_DIR = process.env.STATE_DIR ?? ".state";
const STATE_FILE = path.join(STATE_DIR, "seen-urls.json");
const HEALTH_STATE_FILE = path.join(STATE_DIR, "health-state.json");

const PRUNE_DAYS = Number(process.env.PRUNE_DAYS ?? "60");
const PRUNE_MS = PRUNE_DAYS * 24 * 60 * 60 * 1000;

type StateFile = {
  seen: string[];
  /** Timestamp Unix (ms) de cuando se vio cada URL por primera vez. */
  timestamps?: Record<string, number>;
};
type HealthStateFile = { consecutiveFailuresBySource?: Record<string, number> };

/** Timestamps de las URLs cargadas; se usan en saveSeen para preservar fechas y agregar nuevas. */
let _loadedTimestamps: Record<string, number> = {};

export async function loadSeen(): Promise<Set<string>> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const j = JSON.parse(raw) as StateFile;
    const arr = Array.isArray(j.seen) ? j.seen : [];
    const ts = j.timestamps ?? {};
    const cutoff = Date.now() - PRUNE_MS;

    const pruned = arr.filter((u) => {
      const t = ts[canonicalArticleUrl(u)];
      return t === undefined || t >= cutoff;
    });

    const prunedCount = arr.length - pruned.length;
    if (prunedCount > 0) {
      console.error(`[state] ${prunedCount} URL(s) purgadas del estado (>${PRUNE_DAYS} días).`);
    }

    _loadedTimestamps = {};
    for (const u of pruned) {
      const key = canonicalArticleUrl(u);
      _loadedTimestamps[key] = ts[key] ?? Date.now();
    }

    return new Set(pruned.map((u) => canonicalArticleUrl(u)));
  } catch {
    _loadedTimestamps = {};
    return new Set();
  }
}

export async function saveSeen(seen: Set<string>): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  const now = Date.now();
  const timestamps: Record<string, number> = {};
  for (const url of seen) {
    timestamps[url] = _loadedTimestamps[url] ?? now;
  }
  const data: StateFile = { seen: [...seen].sort(), timestamps };
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
