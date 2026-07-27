// Persists one Stablehype Market Index snapshot per UTC day.
// Runs on the */15 tick; the last write of the day wins (end-of-day value),
// while intraday reads always come from the on-demand /api/market-index compute.

import { buildMarketIndexSnapshot } from "../lib/market-index";

export async function syncMarketIndex(db: D1Database): Promise<void> {
  const snapshot = await buildMarketIndexSnapshot(db);
  if (!snapshot) {
    console.warn("[sync-market-index] no snapshot (caches empty), skipping");
    return;
  }

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  await db
    .prepare(
      `INSERT INTO market_index_history (date, score, band, components_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         score = excluded.score,
         band = excluded.band,
         components_json = excluded.components_json,
         updated_at = excluded.updated_at`
    )
    .bind(
      date,
      snapshot.result.score,
      snapshot.result.bandKey,
      JSON.stringify({ components: snapshot.result.components, inputs: snapshot.inputs }),
      snapshot.updatedAt,
    )
    .run();

  console.log(`[sync-market-index] ${date} → ${snapshot.result.score} (${snapshot.result.bandKey})`);
}
