// GET /api/market-index
//
// Stablehype Market Index (SMI) — market-wide 0-100 health score plus daily
// history for charting. Computed on demand from caches already in D1; the
// */15 cron persists one snapshot per UTC day into market_index_history.

import { buildMarketIndexSnapshot } from "../lib/market-index";
import { MARKET_INDEX_VERSION } from "@shared/lib/market-index-version";
import { MARKET_INDEX_WEIGHTS } from "@shared/lib/market-index-scoring";

export async function handleMarketIndex(db: D1Database): Promise<Response> {
  try {
    const snapshot = await buildMarketIndexSnapshot(db);
    if (!snapshot) {
      return new Response(JSON.stringify({ error: "Data not yet available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    let history: { date: string; score: number; band: string }[] = [];
    try {
      const rows = await db
        .prepare("SELECT date, score, band FROM market_index_history ORDER BY date DESC LIMIT 180")
        .all<{ date: string; score: number; band: string }>();
      history = (rows.results ?? []).reverse();
    } catch {
      // table may not exist yet (migration pending)
    }

    return new Response(
      JSON.stringify({
        index: {
          score: snapshot.result.score,
          bandKey: snapshot.result.bandKey,
          bandLabel: snapshot.result.bandLabel,
          components: snapshot.result.components,
          inputs: snapshot.inputs,
          coinsConsidered: snapshot.coinsConsidered,
          activeDepegCount: snapshot.activeDepegCount,
          stressedCount: snapshot.stressedCount,
          totalMcapUsd: snapshot.totalMcapUsd,
        },
        history,
        methodology: {
          version: MARKET_INDEX_VERSION.currentVersion,
          weights: { ...MARKET_INDEX_WEIGHTS },
        },
        updatedAt: snapshot.updatedAt,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, max-age=60",
          "X-Methodology-Version": MARKET_INDEX_VERSION.currentVersion,
        },
      },
    );
  } catch (err) {
    console.error("[market-index] failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
