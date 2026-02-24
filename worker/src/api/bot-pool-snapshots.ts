/**
 * GET /api/bot/pool-snapshots
 * Returns per-pool historical data at 10-min granularity.
 *
 * Query params:
 *   pool_key   - filter by specific pool (e.g. "curve-dex:Ethereum:USDC-USDT")
 *   stablecoin - filter by stablecoin_id
 *   chain      - filter by chain name
 *   hours      - lookback window (default 6, max 720 = 30 days)
 */
export async function handlePoolSnapshots(
  db: D1Database,
  url: URL
): Promise<Response> {
  const poolKey = url.searchParams.get("pool_key");
  const stablecoin = url.searchParams.get("stablecoin");
  const chain = url.searchParams.get("chain");
  const hours = Math.min(
    Math.max(1, parseInt(url.searchParams.get("hours") ?? "6", 10) || 6),
    720
  );

  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;

  const conditions: string[] = ["snapshot_ts >= ?"];
  const binds: (string | number)[] = [cutoff];

  if (poolKey) {
    conditions.push("pool_key = ?");
    binds.push(poolKey);
  }
  if (stablecoin) {
    conditions.push("stablecoin_id = ?");
    binds.push(stablecoin);
  }
  if (chain) {
    conditions.push("chain = ?");
    binds.push(chain);
  }

  const sql = `
    SELECT stablecoin_id, pool_key, project, chain, pool_symbol, pool_type,
           tvl_usd, volume_24h_usd, balance_ratio, fee_tier, amplification,
           effective_tvl, pair_quality, stress_index, organic_fraction, snapshot_ts
    FROM pool_snapshots
    WHERE ${conditions.join(" AND ")}
    ORDER BY snapshot_ts DESC, pool_key
    LIMIT 10000
  `;

  const rows = await db
    .prepare(sql)
    .bind(...binds)
    .all();

  const snapshots = rows.results ?? [];
  const latestTs = snapshots.length > 0 ? (snapshots[0] as Record<string, unknown>).snapshot_ts : null;

  return new Response(
    JSON.stringify({
      snapshotCount: snapshots.length,
      latestTs,
      hoursRequested: hours,
      snapshots,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, max-age=30",
      },
    }
  );
}
