import { getCache } from "../lib/db";

interface CacheStatus {
  ageSeconds: number | null;
  maxAge: number;
  healthy: boolean;
}

interface CronJobHealth {
  lastSuccess: number | null;
  lastFailure: number | null;
  healthy: boolean;
}

interface BotDbHealth {
  poolSnapshots: { rowCount: number; latestTs: number | null };
  cexPriceHistory: { rowCount: number; latestTs: number | null };
}

interface HealthResponse {
  status: "healthy" | "degraded" | "stale";
  timestamp: number;
  caches: Record<string, CacheStatus>;
  crons: Record<string, CronJobHealth>;
  blacklist: { totalEvents: number; missingAmounts: number };
  botDb: BotDbHealth;
}

const FRESHNESS_THRESHOLDS: Record<string, number> = {
  stablecoins: 600,
  "stablecoin-charts": 600,
  "usds-status": 86400,
};

export async function handleHealth(db: D1Database): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const caches: Record<string, CacheStatus> = {};
  let worstRatio = 0;

  for (const [key, maxAge] of Object.entries(FRESHNESS_THRESHOLDS)) {
    const cached = await getCache(db, key);
    const ageSeconds = cached ? now - cached.updatedAt : null;
    const ratio = ageSeconds != null ? ageSeconds / maxAge : Infinity;
    if (ratio > worstRatio) worstRatio = ratio;

    caches[key] = {
      ageSeconds,
      maxAge,
      healthy: ratio <= 1.5,
    };
  }

  // Cron job health: check last success/failure from cron_health table
  const crons: Record<string, CronJobHealth> = {};
  try {
    const rows = await db
      .prepare("SELECT job_name, last_success, last_failure FROM cron_health")
      .all<{ job_name: string; last_success: number | null; last_failure: number | null }>();
    for (const row of rows.results ?? []) {
      const lastOk = row.last_success;
      const lastFail = row.last_failure;
      // Healthy if last success exists and is more recent than last failure (or no failure)
      const healthy = lastOk != null && (lastFail == null || lastOk >= lastFail);
      crons[row.job_name] = { lastSuccess: lastOk, lastFailure: lastFail, healthy };
      if (!healthy && worstRatio < 1.6) worstRatio = 1.6; // push to "degraded" if a cron is failing
    }
  } catch {
    // cron_health table may not exist yet — ignore
  }

  let blacklist = { totalEvents: 0, missingAmounts: 0 };
  try {
    const counts = await db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN amount IS NULL THEN 1 ELSE 0 END) as missing
         FROM blacklist_events`
      )
      .first<{ total: number; missing: number }>();
    if (counts) {
      blacklist = { totalEvents: counts.total, missingAmounts: counts.missing };
    }
  } catch {
    // D1 query failed — leave defaults
  }

  // Bot database health: row counts + latest timestamps
  let botDb: BotDbHealth = {
    poolSnapshots: { rowCount: 0, latestTs: null },
    cexPriceHistory: { rowCount: 0, latestTs: null },
  };
  try {
    const [poolSnap, cexHist] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) as cnt, MAX(snapshot_ts) as latest FROM pool_snapshots")
        .first<{ cnt: number; latest: number | null }>(),
      db
        .prepare("SELECT COUNT(*) as cnt, MAX(snapshot_ts) as latest FROM cex_price_history")
        .first<{ cnt: number; latest: number | null }>(),
    ]);
    botDb = {
      poolSnapshots: { rowCount: poolSnap?.cnt ?? 0, latestTs: poolSnap?.latest ?? null },
      cexPriceHistory: { rowCount: cexHist?.cnt ?? 0, latestTs: cexHist?.latest ?? null },
    };
  } catch {
    // Tables may not exist yet — leave defaults
  }

  const status: HealthResponse["status"] =
    worstRatio > 2 ? "stale" : worstRatio > 1.5 ? "degraded" : "healthy";

  const body: HealthResponse = { status, timestamp: now, caches, crons, blacklist, botDb };

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
