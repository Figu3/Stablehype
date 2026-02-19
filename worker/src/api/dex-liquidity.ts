export async function handleDexLiquidity(db: D1Database): Promise<Response> {
  try {
    const [result, histResult] = await Promise.all([
      db.prepare("SELECT * FROM dex_liquidity ORDER BY liquidity_score DESC").all(),
      db
        .prepare(
          `SELECT stablecoin_id, total_tvl_usd, snapshot_date
           FROM dex_liquidity_history
           WHERE snapshot_date >= ?
           ORDER BY stablecoin_id, snapshot_date DESC`
        )
        .bind(Math.floor(Date.now() / 1000) - 8 * 86_400) // 8 days back covers 7d comparison
        .all(),
    ]);

    // Build historical TVL lookup: stablecoin_id → sorted snapshots (newest first)
    const histByCoin = new Map<string, { tvl: number; date: number }[]>();
    for (const row of histResult.results ?? []) {
      const id = row.stablecoin_id as string;
      const arr = histByCoin.get(id) ?? [];
      arr.push({ tvl: row.total_tvl_usd as number, date: row.snapshot_date as number });
      histByCoin.set(id, arr);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const oneDayAgo = nowSec - 86_400;
    const sevenDaysAgo = nowSec - 7 * 86_400;

    const map: Record<string, unknown> = {};
    for (const row of result.results ?? []) {
      const id = row.stablecoin_id as string;
      const currentTvl = row.total_tvl_usd as number;

      // Compute trend changes from history
      const history = histByCoin.get(id) ?? [];
      let tvlChange24h: number | null = null;
      let tvlChange7d: number | null = null;

      // Find closest snapshot to 1 day ago and 7 days ago
      for (const snap of history) {
        if (tvlChange24h == null && snap.date <= oneDayAgo && snap.tvl > 0) {
          tvlChange24h = ((currentTvl - snap.tvl) / snap.tvl) * 100;
        }
        if (tvlChange7d == null && snap.date <= sevenDaysAgo && snap.tvl > 0) {
          tvlChange7d = ((currentTvl - snap.tvl) / snap.tvl) * 100;
        }
        if (tvlChange24h != null && tvlChange7d != null) break;
      }

      map[id] = {
        totalTvlUsd: currentTvl,
        totalVolume24hUsd: row.total_volume_24h_usd as number,
        totalVolume7dUsd: row.total_volume_7d_usd as number,
        poolCount: row.pool_count as number,
        pairCount: row.pair_count as number,
        chainCount: row.chain_count as number,
        protocolTvl: row.protocol_tvl_json ? JSON.parse(row.protocol_tvl_json as string) : {},
        chainTvl: row.chain_tvl_json ? JSON.parse(row.chain_tvl_json as string) : {},
        topPools: row.top_pools_json ? JSON.parse(row.top_pools_json as string) : [],
        liquidityScore: row.liquidity_score as number | null,
        concentrationHhi: row.concentration_hhi as number | null,
        depthStability: row.depth_stability as number | null,
        tvlChange24h: tvlChange24h != null ? Math.round(tvlChange24h * 100) / 100 : null,
        tvlChange7d: tvlChange7d != null ? Math.round(tvlChange7d * 100) / 100 : null,
        updatedAt: row.updated_at as number,
      };
    }

    return new Response(JSON.stringify(map), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, max-age=60",
      },
    });
  } catch (err) {
    console.error("[dex-liquidity] D1 query failed:", err);
    return new Response(JSON.stringify({}), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
