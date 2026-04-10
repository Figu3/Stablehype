/**
 * GET  /api/gsm-fees       — Total GSM fees from rebalances since last reset
 * POST /api/gsm-fees/reset — Reset the counter (admin-authed)
 *
 * GSM fee = amountIn - amountOut per rebalance (the spread paid to GHO Stability Module).
 * Uses the cache table to store the reset timestamp — no migration needed.
 */

const CACHE_KEY = "gsm-fees-reset-at";

// GHO refunds received from Aave (reduces GSM fees owed)
// 2026-04-10: 593.7 GHO refund
const GSM_REFUNDS_USD = 593.7;

export async function handleGsmFees(db: D1Database): Promise<Response> {
  try {
    // Get reset timestamp from cache (0 = never reset)
    const resetRow = await db
      .prepare("SELECT value FROM cache WHERE key = ?")
      .bind(CACHE_KEY)
      .first<{ value: string }>();
    const resetAt = resetRow ? Number(resetRow.value) : 0;

    // Sum fees since reset
    const row = await db
      .prepare(
        `SELECT SUM(amount_in_usd - amount_out_usd) as total_fees,
                COUNT(*) as rebalance_count
         FROM clear_rebalances
         WHERE timestamp >= ?`
      )
      .bind(resetAt)
      .first<{ total_fees: number | null; rebalance_count: number }>();

    const grossFees = row?.total_fees ?? 0;
    const netFees = Math.max(0, grossFees - GSM_REFUNDS_USD);

    // All-time GSM volume counters by route
    const GHO = "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f";
    const gsmCounters = await db
      .prepare(
        `SELECT token_in, token_out, ROUND(SUM(amount_in_usd), 2) as vol
         FROM clear_rebalances
         WHERE (token_in = ? OR token_out = ?)
         GROUP BY token_in, token_out`
      )
      .bind(GHO, GHO)
      .all<{ token_in: string; token_out: string; vol: number }>();

    const USDC_ADDR = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const USDT_ADDR = "0xdac17f958d2ee523a2206206994597c13d831ec7";
    const lookup = (tIn: string, tOut: string) =>
      gsmCounters.results?.find((r) => r.token_in === tIn && r.token_out === tOut)?.vol ?? 0;

    return new Response(
      JSON.stringify({
        totalFeesUSD: netFees,
        rebalanceCount: row?.rebalance_count ?? 0,
        resetAt: resetAt || null,
        refundsUSD: GSM_REFUNDS_USD,
        gsmMintedWithUSDC: lookup(USDC_ADDR, GHO),
        gsmMintedWithUSDT: lookup(USDT_ADDR, GHO),
        gsmRedeemedToUSDT: lookup(GHO, USDT_ADDR),
        gsmRedeemedToUSDC: lookup(GHO, USDC_ADDR),
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
