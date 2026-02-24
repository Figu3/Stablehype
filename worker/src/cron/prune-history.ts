/**
 * Prune pool_snapshots and cex_price_history rows older than 30 days.
 * Runs alongside sync-fx-rates on the bi-hourly cron schedule.
 */

const RETENTION_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function pruneHistory(db: D1Database): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - RETENTION_SECONDS;

  const poolResult = await db
    .prepare("DELETE FROM pool_snapshots WHERE snapshot_ts < ?")
    .bind(cutoff)
    .run();

  const cexResult = await db
    .prepare("DELETE FROM cex_price_history WHERE snapshot_ts < ?")
    .bind(cutoff)
    .run();

  const poolDeleted = poolResult.meta?.changes ?? 0;
  const cexDeleted = cexResult.meta?.changes ?? 0;

  if (poolDeleted > 0 || cexDeleted > 0) {
    console.log(
      `[prune-history] Deleted ${poolDeleted} pool_snapshots + ${cexDeleted} cex_price_history rows (cutoff=${new Date(cutoff * 1000).toISOString()})`
    );
  }
}
