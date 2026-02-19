export async function handleDexLiquidity(db: D1Database): Promise<Response> {
  try {
    const result = await db
      .prepare("SELECT * FROM dex_liquidity ORDER BY liquidity_score DESC")
      .all();

    const map: Record<string, unknown> = {};
    for (const row of result.results ?? []) {
      map[row.stablecoin_id as string] = {
        totalTvlUsd: row.total_tvl_usd as number,
        totalVolume24hUsd: row.total_volume_24h_usd as number,
        totalVolume7dUsd: row.total_volume_7d_usd as number,
        poolCount: row.pool_count as number,
        pairCount: row.pair_count as number,
        chainCount: row.chain_count as number,
        protocolTvl: row.protocol_tvl_json ? JSON.parse(row.protocol_tvl_json as string) : {},
        chainTvl: row.chain_tvl_json ? JSON.parse(row.chain_tvl_json as string) : {},
        topPools: row.top_pools_json ? JSON.parse(row.top_pools_json as string) : [],
        liquidityScore: row.liquidity_score as number | null,
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
