/**
 * GET /api/bot/cex-prices
 * Returns aggregated CEX price history at 10-min granularity.
 *
 * Query params:
 *   stablecoin - filter by stablecoin_id (optional)
 *   hours      - lookback window (default 6, max 720 = 30 days)
 */
export async function handleCexPrices(
  db: D1Database,
  url: URL
): Promise<Response> {
  const stablecoin = url.searchParams.get("stablecoin");
  const hours = Math.min(
    Math.max(1, parseInt(url.searchParams.get("hours") ?? "6", 10) || 6),
    720
  );

  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;

  let sql: string;
  let binds: (string | number)[];

  if (stablecoin) {
    sql = `
      SELECT stablecoin_id, price_usd, top_exchange, top_volume_24h,
             exchange_count, avg_price, snapshot_ts
      FROM cex_price_history
      WHERE stablecoin_id = ? AND snapshot_ts >= ?
      ORDER BY snapshot_ts DESC
      LIMIT 10000
    `;
    binds = [stablecoin, cutoff];
  } else {
    sql = `
      SELECT stablecoin_id, price_usd, top_exchange, top_volume_24h,
             exchange_count, avg_price, snapshot_ts
      FROM cex_price_history
      WHERE snapshot_ts >= ?
      ORDER BY snapshot_ts DESC, stablecoin_id
      LIMIT 10000
    `;
    binds = [cutoff];
  }

  const rows = await db
    .prepare(sql)
    .bind(...binds)
    .all();

  const prices = rows.results ?? [];
  const latestTs = prices.length > 0 ? (prices[0] as Record<string, unknown>).snapshot_ts : null;

  return new Response(
    JSON.stringify({
      snapshotCount: prices.length,
      latestTs,
      hoursRequested: hours,
      prices,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, max-age=30",
      },
    }
  );
}
