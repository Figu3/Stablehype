/**
 * GET /api/bot/arb-opportunities
 * Pre-computed arbitrage opportunities with cost model and confidence scoring.
 *
 * Query params:
 *   min_profit_bps - minimum net profit in bps (default 10)
 *   min_tvl        - minimum pool TVL (default 100000)
 *   stablecoin     - filter by stablecoin_id (optional)
 */

// Gas cost estimates per chain (USD)
const GAS_COST_USD: Record<string, number> = {
  Ethereum: 5,
  Base: 0.05,
  Arbitrum: 0.05,
  Polygon: 0.05,
  Optimism: 0.1,
  BSC: 0.3,
  Avalanche: 0.5,
  Gnosis: 0.01,
  Scroll: 0.1,
  Linea: 0.1,
  Mantle: 0.05,
  Blast: 0.05,
};

// DEX fee estimates in bps by pool type keyword
function estimateDexFeeBps(poolType: string): number {
  const pt = poolType.toLowerCase();
  if (pt.includes("1bp") || pt.includes("0.01%")) return 1;
  if (pt.includes("stableswap") || pt.includes("curve")) return 4;
  if (pt.includes("5bp") || pt.includes("0.05%")) return 5;
  if (pt.includes("30bp") || pt.includes("0.3%")) return 30;
  if (pt.includes("100bp") || pt.includes("1%")) return 100;
  return 4; // Default: assume Curve-like 4bps
}

const CEX_FEE_BPS = 10;
const ASSUMED_TRADE_USD = 100_000;

type Confidence = "high" | "medium" | "low";

interface ArbOpportunity {
  stablecoinId: string;
  symbol: string;
  poolKey: string;
  chain: string;
  project: string;
  poolType: string;
  poolTvlUsd: number;
  poolBalanceRatio: number | null;
  // Pricing
  dexPriceUsd: number;
  cexAvgPrice: number;
  cexTopExchange: string;
  cexVolume24h: number;
  spreadBps: number;
  direction: "buy_dex_sell_cex" | "buy_cex_sell_dex";
  // Costs
  gasCostUsd: number;
  dexFeeBps: number;
  cexFeeBps: number;
  slippageBps: number;
  totalCostBps: number;
  // Net
  grossProfitBps: number;
  netProfitBps: number;
  estimatedNetProfitUsd: number;
  // Scoring
  confidence: Confidence;
  signals: string[];
}

function computeConfidence(
  netProfitBps: number,
  poolTvl: number,
  cexVolume: number,
  balanceRatio: number | null
): { confidence: Confidence; signals: string[] } {
  const signals: string[] = [];

  if (netProfitBps > 20) signals.push("strong_spread");
  if (poolTvl > 1_000_000) signals.push("deep_pool");
  else if (poolTvl < 200_000) signals.push("shallow_pool");
  if (cexVolume > 10_000_000) signals.push("high_cex_volume");
  else if (cexVolume < 1_000_000) signals.push("low_cex_volume");
  if (balanceRatio !== null && balanceRatio < 0.42) signals.push("pool_imbalanced");
  if (balanceRatio !== null && balanceRatio > 0.48) signals.push("pool_balanced");

  const isHigh =
    netProfitBps > 20 &&
    poolTvl > 1_000_000 &&
    cexVolume > 10_000_000 &&
    (balanceRatio === null || balanceRatio > 0.4);

  const isMedium =
    netProfitBps > 10 ||
    (poolTvl > 500_000 && cexVolume > 1_000_000);

  const confidence: Confidence = isHigh ? "high" : isMedium ? "medium" : "low";

  return { confidence, signals };
}

export async function handleArbOpportunities(
  db: D1Database,
  url: URL
): Promise<Response> {
  const minProfitBps = Math.max(
    0,
    parseInt(url.searchParams.get("min_profit_bps") ?? "10", 10) || 10
  );
  const minTvl = Math.max(
    0,
    parseInt(url.searchParams.get("min_tvl") ?? "100000", 10) || 100_000
  );
  const stablecoin = url.searchParams.get("stablecoin");

  // 1. Get latest CEX prices
  const cexRows = await db
    .prepare(
      stablecoin
        ? "SELECT stablecoin_id, avg_price, top_exchange, top_volume_24h, snapshot_ts FROM cex_price_history WHERE stablecoin_id = ? ORDER BY snapshot_ts DESC LIMIT 200"
        : "SELECT stablecoin_id, avg_price, top_exchange, top_volume_24h, snapshot_ts FROM cex_price_history ORDER BY snapshot_ts DESC LIMIT 200"
    )
    .bind(...(stablecoin ? [stablecoin] : []))
    .all<{
      stablecoin_id: string;
      avg_price: number;
      top_exchange: string;
      top_volume_24h: number;
      snapshot_ts: number;
    }>();

  const cexMap = new Map<string, (typeof cexRows.results)[number]>();
  for (const row of cexRows.results ?? []) {
    if (!cexMap.has(row.stablecoin_id)) cexMap.set(row.stablecoin_id, row);
  }

  // 2. Get latest pool snapshots
  const tenMinAgo = Math.floor(Date.now() / 1000) - 700;
  const poolRows = await db
    .prepare(
      stablecoin
        ? "SELECT stablecoin_id, pool_key, project, chain, pool_symbol, pool_type, tvl_usd, balance_ratio, fee_tier, snapshot_ts FROM pool_snapshots WHERE snapshot_ts >= ? AND stablecoin_id = ? AND tvl_usd >= ? ORDER BY snapshot_ts DESC LIMIT 5000"
        : "SELECT stablecoin_id, pool_key, project, chain, pool_symbol, pool_type, tvl_usd, balance_ratio, fee_tier, snapshot_ts FROM pool_snapshots WHERE snapshot_ts >= ? AND tvl_usd >= ? ORDER BY snapshot_ts DESC LIMIT 5000"
    )
    .bind(...(stablecoin ? [tenMinAgo, stablecoin, minTvl] : [tenMinAgo, minTvl]))
    .all<{
      stablecoin_id: string;
      pool_key: string;
      project: string;
      chain: string;
      pool_symbol: string;
      pool_type: string;
      tvl_usd: number;
      balance_ratio: number | null;
      fee_tier: number | null;
      snapshot_ts: number;
    }>();

  // 3. Get DEX prices
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

  // 4. Compute arb opportunities
  const opportunities: ArbOpportunity[] = [];
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

    const grossProfitBps = Math.abs(spreadBps);

    // Cost model
    const gasCostUsd = GAS_COST_USD[pool.chain] ?? 2;
    const gasCostBps = Math.round((gasCostUsd / ASSUMED_TRADE_USD) * 10000);
    const dexFeeBps = pool.fee_tier ? pool.fee_tier : estimateDexFeeBps(pool.pool_type);
    const slippageBps = Math.round((ASSUMED_TRADE_USD / pool.tvl_usd) * 100);
    const totalCostBps = gasCostBps + dexFeeBps + CEX_FEE_BPS + slippageBps;

    const netProfitBps = grossProfitBps - totalCostBps;
    if (netProfitBps < minProfitBps) continue;

    const estimatedNetProfitUsd = Math.round((netProfitBps / 10000) * ASSUMED_TRADE_USD * 100) / 100;

    const { confidence, signals } = computeConfidence(
      netProfitBps,
      pool.tvl_usd,
      cex.top_volume_24h,
      pool.balance_ratio
    );

    opportunities.push({
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
      direction: spreadBps > 0 ? "buy_cex_sell_dex" : "buy_dex_sell_cex",
      gasCostUsd,
      dexFeeBps,
      cexFeeBps: CEX_FEE_BPS,
      slippageBps,
      totalCostBps,
      grossProfitBps,
      netProfitBps,
      estimatedNetProfitUsd,
      confidence,
      signals,
    });
  }

  // Sort by net profit descending
  opportunities.sort((a, b) => b.netProfitBps - a.netProfitBps);

  return new Response(
    JSON.stringify({
      updatedAt: Math.floor(Date.now() / 1000),
      opportunityCount: opportunities.length,
      minProfitBps,
      minTvl,
      assumedTradeSizeUsd: ASSUMED_TRADE_USD,
      opportunities,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, max-age=10",
      },
    }
  );
}
