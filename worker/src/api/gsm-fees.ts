/**
 * GET  /api/gsm-fees       — Total GSM fees (vault rebalances + Safe-direct GSM calls) since last reset
 * POST /api/gsm-fees/reset — Reset the counter (admin-authed)
 *
 * GSM fees come from two sources:
 *   1. Vault rebalances: amountIn - amountOut per row in clear_rebalances — the spread
 *      the vault absorbed by routing through GHO GSM during a rebalance.
 *   2. Safe-direct GSM calls: BuyAsset / SellAsset events emitted when the Clear team
 *      Safe (0x9ad8…7619D) calls the Aave GSM contracts directly. These never touch
 *      the ClearVault, so they don't appear in (1). Fee is in GHO and we treat it 1:1 USD.
 *
 * The net figure subtracts GSM_REFUNDS_USD (GHO refunded by Aave to the protocol).
 */

import { GSM_REFUNDS_USD } from "../lib/clear-constants";

const CACHE_KEY = "gsm-fees-reset-at";

export async function handleGsmFees(db: D1Database): Promise<Response> {
  try {
    // Get reset timestamp from cache (0 = never reset)
    const resetRow = await db
      .prepare("SELECT value FROM cache WHERE key = ?")
      .bind(CACHE_KEY)
      .first<{ value: string }>();
    const resetAt = resetRow ? Number(resetRow.value) : 0;

    // Source 1: vault rebalance spread (existing behavior)
    const rebalRow = await db
      .prepare(
        `SELECT SUM(amount_in_usd - amount_out_usd) as total_fees,
                COUNT(*) as rebalance_count
         FROM clear_rebalances
         WHERE timestamp >= ?`
      )
      .bind(resetAt)
      .first<{ total_fees: number | null; rebalance_count: number }>();
    const rebalanceGrossFeesUSD = rebalRow?.total_fees ?? 0;
    const rebalanceCount = rebalRow?.rebalance_count ?? 0;

    // Source 2: Safe-direct GSM BuyAsset/SellAsset fees (new)
    const safeRow = await db
      .prepare(
        `SELECT SUM(fee_usd) as total_fees,
                COUNT(*) as event_count
         FROM safe_gsm_fees
         WHERE timestamp >= ?`
      )
      .bind(resetAt)
      .first<{ total_fees: number | null; event_count: number }>();
    const safeGsmFeesUSD = safeRow?.total_fees ?? 0;
    const safeGsmEventCount = safeRow?.event_count ?? 0;

    const grossFees = rebalanceGrossFeesUSD + safeGsmFeesUSD;
    const netFees = Math.max(0, grossFees - GSM_REFUNDS_USD);

    // GSM volume counters by route × time window (vault-side)
    const GHO = "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f";
    const USDC_ADDR = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const USDT_ADDR = "0xdac17f958d2ee523a2206206994597c13d831ec7";

    const nowSec = Math.floor(Date.now() / 1000);
    const cutoff1d = nowSec - 86_400;
    const cutoff7d = nowSec - 7 * 86_400;
    const cutoff30d = nowSec - 30 * 86_400;
    const cutoff90d = nowSec - 90 * 86_400;

    const gsmCounters = await db
      .prepare(
        `SELECT token_in, token_out,
                SUM(CASE WHEN timestamp >= ? THEN amount_in_usd ELSE 0 END) AS vol_1d,
                SUM(CASE WHEN timestamp >= ? THEN amount_in_usd ELSE 0 END) AS vol_7d,
                SUM(CASE WHEN timestamp >= ? THEN amount_in_usd ELSE 0 END) AS vol_30d,
                SUM(CASE WHEN timestamp >= ? THEN amount_in_usd ELSE 0 END) AS vol_90d,
                SUM(amount_in_usd) AS vol_all
         FROM clear_rebalances
         WHERE token_in = ? OR token_out = ?
         GROUP BY token_in, token_out`
      )
      .bind(cutoff1d, cutoff7d, cutoff30d, cutoff90d, GHO, GHO)
      .all<{
        token_in: string;
        token_out: string;
        vol_1d: number | null;
        vol_7d: number | null;
        vol_30d: number | null;
        vol_90d: number | null;
        vol_all: number | null;
      }>();

    const pick = (
      tIn: string,
      tOut: string,
      col: "vol_1d" | "vol_7d" | "vol_30d" | "vol_90d" | "vol_all"
    ): number => {
      const row = gsmCounters.results?.find(
        (r) => r.token_in === tIn && r.token_out === tOut
      );
      return row?.[col] ?? 0;
    };

    const buildWindow = (
      days: number | null,
      col: "vol_1d" | "vol_7d" | "vol_30d" | "vol_90d" | "vol_all"
    ) => ({
      days,
      mintedUSDC: pick(USDC_ADDR, GHO, col),
      mintedUSDT: pick(USDT_ADDR, GHO, col),
      redeemedUSDC: pick(GHO, USDC_ADDR, col),
      redeemedUSDT: pick(GHO, USDT_ADDR, col),
    });

    const gsmWindows = [
      buildWindow(1, "vol_1d"),
      buildWindow(7, "vol_7d"),
      buildWindow(30, "vol_30d"),
      buildWindow(90, "vol_90d"),
      buildWindow(null, "vol_all"),
    ];

    return new Response(
      JSON.stringify({
        totalFeesUSD: netFees,
        rebalanceCount,
        resetAt: resetAt || null,
        refundsUSD: GSM_REFUNDS_USD,
        breakdown: {
          rebalanceSpreadUSD: rebalanceGrossFeesUSD,
          safeDirectGsmUSD: safeGsmFeesUSD,
          safeDirectGsmEventCount: safeGsmEventCount,
          refundsUSD: GSM_REFUNDS_USD,
        },
        gsmWindows,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  } catch (err) {
    console.error("[gsm-fees] Query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function handleGsmFeesReset(db: D1Database): Promise<Response> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare("INSERT OR REPLACE INTO cache (key, value, updated_at) VALUES (?, ?, ?)")
      .bind(CACHE_KEY, String(now), now)
      .run();

    return new Response(JSON.stringify({ ok: true, resetAt: now }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[gsm-fees] Reset failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
