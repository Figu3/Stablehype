/**
 * GET  /api/gsm-fees       — Total GSM fees from rebalances since last reset
 * POST /api/gsm-fees/reset — Reset the counter (admin-authed)
 *
 * GSM fee = amountIn - amountOut per rebalance (the spread paid to GHO Stability Module).
 * Uses the cache table to store the reset timestamp — no migration needed.
 */

const CACHE_KEY = "gsm-fees-reset-at";

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

    return new Response(
      JSON.stringify({
        totalFeesUSD: row?.total_fees ?? 0,
        rebalanceCount: row?.rebalance_count ?? 0,
        resetAt: resetAt || null,
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
