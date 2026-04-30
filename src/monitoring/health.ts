import type { NewsSource } from "../types.js";

export type ErrorPhase = "sitemap" | "match" | "enrich";

export type SourceRunHealth = {
  sourceId: string;
  sourceName: string;
  hadError: boolean;
  errors: number;
};

export type HealthState = {
  consecutiveFailuresBySource: Record<string, number>;
};

export type HealthSummary = {
  totalSources: number;
  failedSources: number;
  failedPercent: number;
  http403ByDomain: Array<{ domain: string; count: number }>;
  bySource: SourceRunHealth[];
  streakAlerts: Array<{ sourceId: string; sourceName: string; streak: number }>;
};

export type HealthSeverity = "ok" | "warning" | "critical";

export type HealthAlertConfig = {
  warningFailedPercent: number;
  criticalFailedPercent: number;
  warning403PerDomain: number;
  critical403PerDomain: number;
  warningStreak: number;
  criticalStreak: number;
};

export type HealthAlertEval = {
  severity: HealthSeverity;
  reasons: string[];
  shouldNotify: boolean;
};

function parseHttpStatusFromError(error: unknown): number | undefined {
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.match(/\bHTTP\s+(\d{3})\b/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}

type SourceHealthMutable = SourceRunHealth & { _phases: Set<ErrorPhase> };

export class HealthTracker {
  private bySource = new Map<string, SourceHealthMutable>();
  private http403DomainCount = new Map<string, number>();
  private sources: NewsSource[];

  constructor(sources: NewsSource[]) {
    this.sources = sources;
    for (const s of sources) {
      this.bySource.set(s.id, {
        sourceId: s.id,
        sourceName: s.name,
        hadError: false,
        errors: 0,
        _phases: new Set<ErrorPhase>(),
      });
    }
  }

  markError(sourceId: string, phase: ErrorPhase, url: string, error: unknown): void {
    const h = this.bySource.get(sourceId);
    if (!h) return;
    h.hadError = true;
    h.errors += 1;
    h._phases.add(phase);

    const code = parseHttpStatusFromError(error);
    if (code === 403) {
      const d = domainOf(url);
      this.http403DomainCount.set(d, (this.http403DomainCount.get(d) ?? 0) + 1);
    }
  }

  finalize(
    previousState: HealthState,
    streakThreshold: number,
  ): { nextState: HealthState; summary: HealthSummary } {
    const next: Record<string, number> = {
      ...(previousState.consecutiveFailuresBySource ?? {}),
    };
    const bySource: SourceRunHealth[] = [];
    const streakAlerts: Array<{ sourceId: string; sourceName: string; streak: number }> =
      [];

    for (const s of this.sources) {
      const row = this.bySource.get(s.id);
      const hadError = Boolean(row?.hadError);
      const prev = next[s.id] ?? 0;
      const current = hadError ? prev + 1 : 0;
      next[s.id] = current;
      if (hadError && current >= streakThreshold) {
        streakAlerts.push({ sourceId: s.id, sourceName: s.name, streak: current });
      }
      bySource.push({
        sourceId: s.id,
        sourceName: s.name,
        hadError,
        errors: row?.errors ?? 0,
      });
    }

    const failedSources = bySource.filter((x) => x.hadError).length;
    const totalSources = bySource.length;
    const failedPercent =
      totalSources > 0 ? Number(((failedSources * 100) / totalSources).toFixed(1)) : 0;
    const http403ByDomain = [...this.http403DomainCount.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);

    return {
      nextState: { consecutiveFailuresBySource: next },
      summary: {
        totalSources,
        failedSources,
        failedPercent,
        http403ByDomain,
        bySource,
        streakAlerts,
      },
    };
  }
}

export function formatHealthSlackMessage(summary: HealthSummary): string {
  const top403 = summary.http403ByDomain.slice(0, 8);
  const top403Line =
    top403.length > 0
      ? top403.map((x) => `${x.domain}: ${x.count}`).join(" | ")
      : "sin 403";
  const failedList = summary.bySource
    .filter((x) => x.hadError)
    .map((x) => `${x.sourceName} (${x.errors})`)
    .join(", ");
  const streaks =
    summary.streakAlerts.length > 0
      ? summary.streakAlerts
          .map((x) => `${x.sourceName}: ${x.streak} corridas`)
          .join(" | ")
      : "sin alertas de racha";

  return [
    `:rotating_light: *Interior monitor · Salud de fuentes*`,
    `Medios con error: ${summary.failedSources}/${summary.totalSources} (${summary.failedPercent}%)`,
    `403 por dominio: ${top403Line}`,
    `Medios fallados: ${failedList || "ninguno"}`,
    `Rachas: ${streaks}`,
  ].join("\n");
}

function num(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? String(fallback));
  return Number.isFinite(n) ? n : fallback;
}

export function healthAlertConfigFromEnv(): HealthAlertConfig {
  return {
    warningFailedPercent: Math.max(0, num("HEALTH_WARN_FAILED_PERCENT", 15)),
    criticalFailedPercent: Math.max(0, num("HEALTH_CRIT_FAILED_PERCENT", 30)),
    warning403PerDomain: Math.max(1, Math.floor(num("HEALTH_WARN_403_PER_DOMAIN", 2))),
    critical403PerDomain: Math.max(
      1,
      Math.floor(num("HEALTH_CRIT_403_PER_DOMAIN", 5)),
    ),
    warningStreak: Math.max(1, Math.floor(num("HEALTH_WARN_STREAK", 2))),
    criticalStreak: Math.max(1, Math.floor(num("HEALTH_CRIT_STREAK", 4))),
  };
}

export function evaluateHealthSeverity(
  summary: HealthSummary,
  cfg: HealthAlertConfig,
): HealthAlertEval {
  const max403 = summary.http403ByDomain[0]?.count ?? 0;
  const maxStreak = summary.streakAlerts.reduce(
    (acc, x) => (x.streak > acc ? x.streak : acc),
    0,
  );
  const criticalReasons: string[] = [];
  const warningReasons: string[] = [];

  if (summary.failedPercent >= cfg.criticalFailedPercent) {
    criticalReasons.push(
      `medios con error ${summary.failedPercent}% (>=${cfg.criticalFailedPercent}%)`,
    );
  } else if (summary.failedPercent >= cfg.warningFailedPercent) {
    warningReasons.push(
      `medios con error ${summary.failedPercent}% (>=${cfg.warningFailedPercent}%)`,
    );
  }

  if (max403 >= cfg.critical403PerDomain) {
    criticalReasons.push(
      `pico de 403 por dominio ${max403} (>=${cfg.critical403PerDomain})`,
    );
  } else if (max403 >= cfg.warning403PerDomain) {
    warningReasons.push(
      `pico de 403 por dominio ${max403} (>=${cfg.warning403PerDomain})`,
    );
  }

  if (maxStreak >= cfg.criticalStreak) {
    criticalReasons.push(`racha de fallas ${maxStreak} (>=${cfg.criticalStreak})`);
  } else if (maxStreak >= cfg.warningStreak) {
    warningReasons.push(`racha de fallas ${maxStreak} (>=${cfg.warningStreak})`);
  }

  if (criticalReasons.length > 0) {
    return {
      severity: "critical",
      reasons: criticalReasons,
      shouldNotify: true,
    };
  }
  if (warningReasons.length > 0) {
    return {
      severity: "warning",
      reasons: warningReasons,
      shouldNotify: true,
    };
  }
  return { severity: "ok", reasons: [], shouldNotify: false };
}

export function formatHealthSlackAlertMessage(
  summary: HealthSummary,
  evalRes: HealthAlertEval,
): string {
  const icon = evalRes.severity === "critical" ? ":rotating_light:" : ":warning:";
  const header =
    evalRes.severity === "critical"
      ? `${icon} *Interior monitor · ALERTA CRITICA de fuentes*`
      : `${icon} *Interior monitor · Alerta de salud de fuentes*`;
  const reasons = evalRes.reasons.join(" | ");
  return `${header}\nMotivos: ${reasons}\n\n${formatHealthSlackMessage(summary)}`;
}
