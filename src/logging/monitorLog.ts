import { appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/** Retención: archivos de log más antiguos que esto se eliminan al iniciar y tras cada append. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const PREFIX = "interior-monitor-";

export function getMonitorLogDir(): string {
  const fromEnv = process.env.INTERIOR_MONITOR_LOG_DIR?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : join(process.cwd(), "logs");
}

function todayLogFile(logDir: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return join(logDir, `${PREFIX}${y}-${m}-${day}.log`);
}

async function pruneOldLogs(logDir: string): Promise<void> {
  const cutoff = Date.now() - RETENTION_MS;
  let names: string[];
  try {
    names = await readdir(logDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(PREFIX) || !name.endsWith(".log")) continue;
    const path = join(logDir, name);
    try {
      const st = await stat(path);
      if (st.mtimeMs < cutoff) await unlink(path);
    } catch {
      /* ignore */
    }
  }
}

/** Asegura el directorio y elimina logs de más de 30 días. */
export async function initMonitorLogging(): Promise<void> {
  const dir = getMonitorLogDir();
  await mkdir(dir, { recursive: true });
  await pruneOldLogs(dir);
}

/**
 * Registra una línea con marca temporal (errores, salud de fuentes, etc.).
 * No va a Slack.
 */
export async function appendMonitorLog(message: string): Promise<void> {
  const dir = getMonitorLogDir();
  await mkdir(dir, { recursive: true });
  const path = todayLogFile(dir);
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(path, line, "utf8");
  await pruneOldLogs(dir);
}
