/**
 * GET /api/bot/spreads
 * Computes real-time DEX-CEX spreads and DEX-DEX imbalance signals.
 *
 * Query params:
 *   stablecoin      - filter by stablecoin_id (optional)
 *   min_spread_bps  - minimum absolute spread to surface (default 5)
 */

interface SpreadEntry {
  stablecoinId: string;
  symbol: string;
  poolKey: string;
  chain: string;
  project: string;
  poolType: string;
  poolTvlUsd: number;
  poolBalanceRatio: number | null;
  dexPriceUsd: number;
  cexAvgPrice: number;
  cexTopExchange: string;
  cexVolume24h: number;
  spreadBps: number;
  direction: "dex_cheap" | "cex_cheap";
  imbalanceSignal: boolean;
  snapshotTs: number;
}

export async function handleSpreads(
  db: D1Database,
  url: URL
): Promise<Response> {
  const stablecoin = url.searchParams.get("stablecoin");
  const minSpreadBps = Math.max(
    0,
    parseInt(url.searchParams.get("min_spread_bps") ?? "5", 10) || 5
  );

  // 1. Get latest CEX prices (one per stablecoin)
  const cexFilter = stablecoin ? "WHERE stablecoin_id = ?" : "";
  const cexBinds = stablecoin ? [stablecoin] : [];
  const cexRows = await db
    .prepare(
      `SELECT stablecoin_id, avg_price, top_exchange, top_volume_24h, snapshot_ts
       FROM cex_price_history
       ${cexFilter}
       ORDER BY snapshot_ts DESC
       LIMIT 200`
    )
    .bind(...cexBinds)
    .all<{
      stablecoin_id: string;
      avg_price: number;
      top_exchange: string;
      top_volume_24h: number;
      snapshot_ts: number;
    }>();

  // Deduplicate: keep only the latest row per stablecoin
  const cexMap = new Map<string, (typeof cexRows.results)[number]>();
  for (const row of cexRows.results ?? []) {
    if (!cexMap.has(row.stablecoin_id)) {
      cexMap.set(row.stablecoin_id, row);
    }
  }

  // 2. Get latest pool snapshots (last 10 minutes)
  const tenMinAgo = Math.floor(Date.now() / 1000) - 700; // slight buffer
  const poolFilter = stablecoin
    ? "WHERE snapshot_ts >= ? AND stablecoin_id = ?"
    : "WHERE snapshot_ts >= ?";
  const poolBinds: (string | number)[] = stablecoin
    ? [tenMinAgo, stablecoin]
    : [tenMinAgo];

  const poolRows = await db
    .prepare(
      `SELECT stablecoin_id, pool_key, project, chain, pool_symbol, pool_type,
              tvl_usd, balance_ratio, snapshot_ts
       FROM pool_snapshots
       ${poolFilter}
       ORDER BY snapshot_ts DESC
       LIMIT 5000`
    )
    .bind(...poolBinds)
    .all<{
      stablecoin_id: string;
      pool_key: string;
      project: string;
      chain: string;
      pool_symbol: string;
      pool_type: string;
      tvl_usd: number;
      balance_ratio: number | null;
      snapshot_ts: number;
    }>();

  // 3. Get DEX prices (TVL-weighted median from dex_prices table)
  const dexRows = await db
    .prepare(
      stablecoin
        ? "SELECT stablecoin_id, symbol, dex_price_usd FROM dex_prices WHERE stablecoin_id = ?"
        : "SELECT stablecoin_id, symbol, dex_price_usd FROM dex_prices"
    )
    .bind(...(stablecoin ? [stablecoin] : []))
    .all<{ stablecoin_id: string; symbol: string; dex_price_usd: number }>();

  const dexPriceMap = new Map<string, { symbol: string; price: number }>();
  for (const row of dexRows.results ?? []) {
    dexPriceMap.set(row.stablecoin_id, { symbol: row.symbol, price: row.dex_price_usd });
  }

  // 4. Compute spreads
  const spreads: SpreadEntry[] = [];

  // Deduplicate pools: keep only latest snapshot per pool_key + stablecoin_id
  const seenPools = new Set<string>();
  for (const pool of poolRows.results ?? []) {
    const dedup = `${pool.pool_key}:${pool.stablecoin_id}`;
    if (seenPools.has(dedup)) continue;
    seenPools.add(dedup);

    const cex = cexMap.get(pool.stablecoin_id);
    const dex = dexPriceMap.get(pool.stablecoin_id);
    if (!cex || !dex || cex.avg_price <= 0) continue;

    const spreadBps = Math.round(
      ((dex.price - cex.avg_price) / cex.avg_price) * 10000
    );

    if (Math.abs(spreadBps) < minSpreadBps) continue;

    // Imbalance signal: balance_ratio significantly below 0.45 suggests the tracked coin
    // is over-represented (cheaper) in this pool
    const imbalanceSignal = pool.balance_ratio !== null && pool.balance_ratio < 0.45;

    spreads.push({
      stablecoinId: pool.stablecoin_id,
      symbol: dex.symbol,
      poolKey: pool.pool_key,
      chain: pool.chain,
      project: pool.project,
      poolType: pool.pool_type,
      poolTvlUsd: pool.tvl_usd,
      poolBalanceRatio: pool.balance_ratio,
      dexPriceUsd: dex.price,
      cexAvgPrice: cex.avg_price,
      cexTopExchange: cex.top_exchange,
      cexVolume24h: cex.top_volume_24h,
      spreadBps,
      direction: spreadBps > 0 ? "dex_cheap" : "cex_cheap",
      imbalanceSignal,
      snapshotTs: pool.snapshot_ts,
    });
  }

  // Sort by absolute spread descending
  spreads.sort((a, b) => Math.abs(b.spreadBps) - Math.abs(a.spreadBps));

  return new Response(
    JSON.stringify({
      updatedAt: Math.floor(Date.now() / 1000),
      spreadCount: spreads.length,
      minSpreadBps,
      spreads,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, max-age=10",
      },
    }
  );
}
