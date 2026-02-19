import { TRACKED_STABLECOINS } from "../../../src/lib/stablecoins";
import { fetchWithRetry } from "../lib/fetch-retry";

const DEFILLAMA_YIELDS_URL = "https://yields.llama.fi/pools";
const DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/protocols";
const CURVE_API_BASE = "https://api.curve.finance/v1/getPools/all";
const CURVE_CHAINS = ["ethereum", "base", "arbitrum", "polygon"] as const;

// Uniswap V3 subgraph IDs per chain
const UNIV3_SUBGRAPHS: Record<string, string> = {
  ethereum: "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
  base: "FUbEPQw1oMghy39fwWBFY5fE6MXPXZQtjncQy2cXdrNS",
};

const UNIV3_POOL_QUERY = `{
  pools(
    first: 1000,
    orderBy: totalValueLockedUSD,
    orderDirection: desc,
    where: { totalValueLockedUSD_gt: "10000" }
  ) {
    id
    token0 { id symbol }
    token1 { id symbol }
    feeTier
    totalValueLockedUSD
    volumeUSD
  }
}`;

// Well-known composite pool names → constituent symbols
const COMPOSITE_POOL_NAMES: Record<string, string[]> = {
  "3pool": ["DAI", "USDC", "USDT"],
  "3crv": ["DAI", "USDC", "USDT"],
  "3CRV": ["DAI", "USDC", "USDT"],
  "fraxbp": ["FRAX", "USDC"],
  "FRAXBP": ["FRAX", "USDC"],
};

// Quality multipliers for pool-type-adjusted TVL
const QUALITY_MULTIPLIERS: Record<string, number> = {
  "curve-stableswap-high-a": 1.0,
  "curve-stableswap": 0.8,
  "uniswap-v3-1bp": 0.85,
  "uniswap-v3-5bp": 0.7,
  "uniswap-v3-30bp": 0.4,
  "fluid-dex": 0.85,
  "balancer-stable": 0.85,
  "generic": 0.3,
};

interface LlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  volumeUsd1d: number | null;
  volumeUsd7d: number | null;
  stablecoin: boolean;
  underlyingTokens: string[] | null;
}

interface CurvePool {
  address: string;
  name: string;
  amplificationCoefficient: string;
  coins: { symbol: string; poolBalance: string; usdPrice: number; decimals: string }[];
  usdTotal: number;
  isMetaPool: boolean;
  assetTypeName: string;
  totalSupply: number;
}

interface LiquidityMetrics {
  stablecoinId: string;
  symbol: string;
  totalTvlUsd: number;
  totalVolume24hUsd: number;
  totalVolume7dUsd: number;
  poolCount: number;
  chains: Set<string>;
  pairs: Set<string>;
  protocolTvl: Record<string, number>;
  chainTvl: Record<string, number>;
  qualityAdjustedTvl: number;
  topPools: PoolEntry[];
}

interface PoolEntry {
  project: string;
  chain: string;
  tvlUsd: number;
  symbol: string;
  volumeUsd1d: number;
  poolType: string;
  extra?: {
    amplificationCoefficient?: number;
    balanceRatio?: number;
    feeTier?: number;
  };
}

/** Parse pool symbol string into constituent token symbols */
function parsePoolSymbols(symbol: string): string[] {
  // Handle known composite names first
  for (const [name, symbols] of Object.entries(COMPOSITE_POOL_NAMES)) {
    if (symbol === name || symbol.startsWith(`${name}-`)) {
      return symbols;
    }
  }
  // Split on common delimiters: "-", "/", "+", " "
  return symbol
    .split(/[-/+ ]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Classify a DeFiLlama pool into a pool type for quality weighting */
function classifyPoolType(project: string, symbol: string): string {
  const proj = project.toLowerCase();
  if (proj.includes("curve")) return "curve-stableswap";
  if (proj.includes("fluid")) return "fluid-dex";
  if (proj.includes("balancer") && proj.includes("stable")) return "balancer-stable";
  if (proj.includes("uniswap-v3") || proj === "uniswap-v3") {
    // Infer fee tier from symbol if possible (e.g., some pools mention it)
    // Default to 5bp for stable pairs
    return "uniswap-v3-5bp";
  }
  return "generic";
}

/** Get quality multiplier for a pool type, with Curve A-factor override */
function getQualityMultiplier(poolType: string, curveA?: number): number {
  if (poolType === "curve-stableswap" && curveA != null) {
    return curveA >= 500 ? QUALITY_MULTIPLIERS["curve-stableswap-high-a"]! : QUALITY_MULTIPLIERS["curve-stableswap"]!;
  }
  return QUALITY_MULTIPLIERS[poolType] ?? QUALITY_MULTIPLIERS["generic"]!;
}

function computeLiquidityScore(m: LiquidityMetrics): number {
  // Component 1: TVL depth (35%)
  // Log-scale: $100K=20, $1M=40, $10M=60, $100M=80, $1B+=100
  const tvlScore = Math.min(
    100,
    Math.max(0, 20 * Math.log10(Math.max(m.totalTvlUsd, 1) / 100_000) + 20)
  );

  // Component 2: Volume activity (25%)
  // Volume/TVL ratio: 0→0, ~0.5→100
  const vtRatio =
    m.totalTvlUsd > 0 ? m.totalVolume24hUsd / m.totalTvlUsd : 0;
  const volumeScore = Math.min(100, vtRatio * 200);

  // Component 3: Pool quality (20%)
  // Quality-adjusted TVL on same log scale
  const qualTvlScore = Math.min(
    100,
    Math.max(0, 20 * Math.log10(Math.max(m.qualityAdjustedTvl, 1) / 100_000) + 20)
  );

  // Component 4: Pair diversity (10%)
  const diversityScore = Math.min(100, m.poolCount * 5);

  // Component 5: Cross-chain presence (10%)
  const chainCount = m.chains.size;
  const chainScore =
    chainCount <= 1
      ? 15
      : Math.min(100, 15 + (chainCount - 1) * 12);

  const raw =
    tvlScore * 0.35 +
    volumeScore * 0.25 +
    qualTvlScore * 0.2 +
    diversityScore * 0.1 +
    chainScore * 0.1;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

function initMetrics(id: string, symbol: string): LiquidityMetrics {
  return {
    stablecoinId: id,
    symbol,
    totalTvlUsd: 0,
    totalVolume24hUsd: 0,
    totalVolume7dUsd: 0,
    poolCount: 0,
    chains: new Set(),
    pairs: new Set(),
    protocolTvl: {},
    chainTvl: {},
    qualityAdjustedTvl: 0,
    topPools: [],
  };
}

/** Normalize protocol names for grouping */
function normalizeProtocol(project: string): string {
  const p = project.toLowerCase();
  if (p.includes("curve")) return "curve";
  if (p.includes("uniswap-v3") || p === "uniswap-v3") return "uniswap-v3";
  if (p.includes("uniswap")) return "uniswap";
  if (p.includes("fluid")) return "fluid";
  if (p.includes("balancer")) return "balancer";
  if (p.includes("aerodrome")) return "aerodrome";
  if (p.includes("velodrome")) return "velodrome";
  if (p.includes("pancakeswap")) return "pancakeswap";
  return "other";
}

export async function syncDexLiquidity(db: D1Database, graphApiKey: string | null): Promise<void> {
  console.log("[dex-liquidity] Starting sync");

  // --- 1. Fetch DeFiLlama yields, protocols list, and Curve data ---
  const [llamaRes, protocolsRes, ...curveResponses] = await Promise.all([
    fetchWithRetry(DEFILLAMA_YIELDS_URL, {
      headers: { "User-Agent": "Pharos/1.0" },
    }),
    fetchWithRetry(DEFILLAMA_PROTOCOLS_URL, {
      headers: { "User-Agent": "Pharos/1.0" },
    }),
    ...CURVE_CHAINS.map((chain) =>
      fetchWithRetry(`${CURVE_API_BASE}/${chain}`, {
        headers: { "User-Agent": "Pharos/1.0" },
      })
    ),
  ]);

  if (!llamaRes?.ok) {
    console.error("[dex-liquidity] DeFiLlama yields fetch failed");
    return;
  }

  // Build set of project slugs categorized as "Dexs" by DeFiLlama
  const dexProjects = new Set<string>();
  if (protocolsRes?.ok) {
    const protocols = (await protocolsRes.json()) as { slug: string; category?: string }[];
    for (const p of protocols) {
      if (p.category === "Dexs") dexProjects.add(p.slug);
    }
    console.log(`[dex-liquidity] Indexed ${dexProjects.size} DEX projects from DeFiLlama protocols`);
  } else {
    console.error("[dex-liquidity] DeFiLlama protocols fetch failed — cannot filter DEX pools, aborting");
    return;
  }

  const llamaData = (await llamaRes.json()) as { data: LlamaPool[] };
  const pools = llamaData.data;
  if (!pools || pools.length < 100) {
    console.error(`[dex-liquidity] DeFiLlama returned only ${pools?.length ?? 0} pools, skipping`);
    return;
  }
  console.log(`[dex-liquidity] Got ${pools.length} pools from DeFiLlama yields`);

  // --- 2. Parse Curve API responses for A-factor and balance data ---
  const curvePoolMap = new Map<string, { A: number; balanceRatio: number; tvl: number }>();
  for (let i = 0; i < CURVE_CHAINS.length; i++) {
    const res = curveResponses[i];
    if (!res?.ok) continue;
    try {
      const json = (await res.json()) as { data?: { poolData?: CurvePool[] } };
      const curvePools = json.data?.poolData ?? [];
      for (const pool of curvePools) {
        if (!pool.coins || pool.coins.length < 2) continue;
        const A = parseInt(pool.amplificationCoefficient, 10);
        if (isNaN(A)) continue;

        // Compute balance ratio (min/max) — 1.0 = perfectly balanced
        const balances = pool.coins.map((c) => {
          const raw = parseFloat(c.poolBalance);
          const decimals = parseInt(c.decimals, 10);
          return isNaN(raw) || isNaN(decimals) ? 0 : raw / 10 ** decimals * (c.usdPrice || 1);
        }).filter((b) => b > 0);

        let balanceRatio = 1;
        if (balances.length >= 2) {
          const minBal = Math.min(...balances);
          const maxBal = Math.max(...balances);
          balanceRatio = maxBal > 0 ? minBal / maxBal : 0;
        }

        // Build a key from pool coins for matching
        const coinSymbols = pool.coins
          .map((c) => c.symbol.toUpperCase())
          .sort()
          .join("-");
        curvePoolMap.set(
          `${CURVE_CHAINS[i]}:${pool.address.toLowerCase()}`,
          { A, balanceRatio, tvl: pool.usdTotal }
        );
        // Also store by symbol combo for fallback matching
        curvePoolMap.set(
          `${CURVE_CHAINS[i]}:${coinSymbols}`,
          { A, balanceRatio, tvl: pool.usdTotal }
        );
      }
    } catch (err) {
      console.warn(`[dex-liquidity] Failed to parse Curve ${CURVE_CHAINS[i]}:`, err);
    }
  }
  console.log(`[dex-liquidity] Indexed ${curvePoolMap.size} Curve pools`);

  // --- 2b. Fetch Uniswap V3 subgraph data for fee tier enrichment ---
  const uniV3PoolFees = new Map<string, number>(); // "chain:address" → feeTier
  const uniV3SymbolFees = new Map<string, number>(); // "chain:SYM0:SYM1" → lowest feeTier
  if (graphApiKey) {
    for (const [chain, subgraphId] of Object.entries(UNIV3_SUBGRAPHS)) {
      try {
        const url = `https://gateway.thegraph.com/api/${graphApiKey}/subgraphs/id/${subgraphId}`;
        const res = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "Pharos/1.0" },
          body: JSON.stringify({ query: UNIV3_POOL_QUERY }),
        });
        if (!res?.ok) {
          console.warn(`[dex-liquidity] Uni V3 subgraph failed for ${chain}: ${res?.status}`);
          continue;
        }
        const json = (await res.json()) as {
          data?: {
            pools?: {
              id: string;
              token0: { id: string; symbol: string };
              token1: { id: string; symbol: string };
              feeTier: string;
              totalValueLockedUSD: string;
              volumeUSD: string;
            }[];
          };
        };
        const subPools = json.data?.pools ?? [];
        for (const p of subPools) {
          const feeTier = parseInt(p.feeTier, 10);
          if (isNaN(feeTier)) continue;
          // Address-based lookup
          uniV3PoolFees.set(`${chain}:${p.id.toLowerCase()}`, feeTier);
          // Symbol-based fallback (keep lowest fee tier per pair = most optimized for stables)
          const syms = [p.token0.symbol.toUpperCase(), p.token1.symbol.toUpperCase()].sort().join(":");
          const symKey = `${chain}:${syms}`;
          const existing = uniV3SymbolFees.get(symKey);
          if (existing == null || feeTier < existing) {
            uniV3SymbolFees.set(symKey, feeTier);
          }
        }
        console.log(`[dex-liquidity] Indexed ${subPools.length} Uni V3 pools from ${chain} subgraph`);
      } catch (err) {
        console.warn(`[dex-liquidity] Uni V3 subgraph error for ${chain}:`, err);
      }
    }
  } else {
    console.log("[dex-liquidity] No GRAPH_API_KEY, skipping Uni V3 subgraph enrichment");
  }

  // --- 3. Build symbol → stablecoinId lookup ---
  const symbolToIds = new Map<string, string[]>();
  for (const meta of TRACKED_STABLECOINS) {
    const key = meta.symbol.toUpperCase();
    const existing = symbolToIds.get(key) ?? [];
    existing.push(meta.id);
    symbolToIds.set(key, existing);
  }

  // --- 4. Process DeFiLlama pools ---
  const metrics = new Map<string, LiquidityMetrics>();

  for (const pool of pools) {
    if (!pool.tvlUsd || pool.tvlUsd < 10_000) continue; // Skip dust pools
    if (!dexProjects.has(pool.project)) continue; // Only count DEX pools

    // Parse pool symbol into constituent tokens
    const poolSymbols = parsePoolSymbols(pool.symbol);
    const matchedIds = new Set<string>();
    for (const sym of poolSymbols) {
      const ids = symbolToIds.get(sym.toUpperCase());
      if (ids) ids.forEach((id) => matchedIds.add(id));
    }

    if (matchedIds.size === 0) continue;

    const poolType = classifyPoolType(pool.project, pool.symbol);
    const protocol = normalizeProtocol(pool.project);
    const vol1d = pool.volumeUsd1d ?? 0;
    const vol7d = pool.volumeUsd7d ?? 0;

    // Try to find Curve enrichment data
    const chainNorm = pool.chain.toLowerCase();
    const poolSymbolsSorted = poolSymbols.map((s) => s.toUpperCase()).sort().join("-");
    const curveData = curvePoolMap.get(`${chainNorm}:${poolSymbolsSorted}`);

    // Determine quality multiplier
    let qualMult: number;
    let resolvedPoolType = poolType;
    let feeTierForExtra: number | undefined;
    if (curveData) {
      resolvedPoolType = curveData.A >= 500 ? "curve-stableswap-high-a" : "curve-stableswap";
      qualMult = getQualityMultiplier(resolvedPoolType, curveData.A);
      // Penalize severely imbalanced Curve pools
      if (curveData.balanceRatio < 0.3) {
        qualMult *= 0.5;
      }
    } else if (poolType === "uniswap-v3-5bp" && uniV3PoolFees.size > 0) {
      // Try to resolve exact fee tier from subgraph data
      // Address-based lookup (DeFiLlama pool field may be the pool address)
      const addrKey = `${chainNorm}:${pool.pool.toLowerCase()}`;
      let feeTier = uniV3PoolFees.get(addrKey);
      // Fallback: symbol-based lookup (lowest fee tier for this pair on this chain)
      if (feeTier == null) {
        const symKey = `${chainNorm}:${poolSymbols.map((s) => s.toUpperCase()).sort().join(":")}`;
        feeTier = uniV3SymbolFees.get(symKey);
      }
      if (feeTier != null) {
        feeTierForExtra = feeTier;
        if (feeTier <= 100) resolvedPoolType = "uniswap-v3-1bp";
        else if (feeTier <= 500) resolvedPoolType = "uniswap-v3-5bp";
        else resolvedPoolType = "uniswap-v3-30bp";
      }
      qualMult = getQualityMultiplier(resolvedPoolType);
    } else {
      qualMult = getQualityMultiplier(poolType);
    }

    for (const id of matchedIds) {
      const meta = TRACKED_STABLECOINS.find((s) => s.id === id);
      if (!meta) continue;

      let m = metrics.get(id);
      if (!m) {
        m = initMetrics(id, meta.symbol);
        metrics.set(id, m);
      }

      m.totalTvlUsd += pool.tvlUsd;
      m.totalVolume24hUsd += vol1d;
      m.totalVolume7dUsd += vol7d;
      m.poolCount++;
      m.chains.add(pool.chain);
      m.pairs.add(pool.symbol);
      m.qualityAdjustedTvl += pool.tvlUsd * qualMult;

      // Protocol TVL breakdown
      m.protocolTvl[protocol] = (m.protocolTvl[protocol] ?? 0) + pool.tvlUsd;

      // Chain TVL breakdown
      m.chainTvl[pool.chain] = (m.chainTvl[pool.chain] ?? 0) + pool.tvlUsd;

      // Track top pools
      m.topPools.push({
        project: pool.project,
        chain: pool.chain,
        tvlUsd: pool.tvlUsd,
        symbol: pool.symbol,
        volumeUsd1d: vol1d,
        poolType: resolvedPoolType,
        extra: curveData
          ? {
              amplificationCoefficient: curveData.A,
              balanceRatio: Math.round(curveData.balanceRatio * 100) / 100,
            }
          : feeTierForExtra != null
            ? { feeTier: feeTierForExtra }
            : undefined,
      });
    }
  }

  console.log(`[dex-liquidity] Matched ${metrics.size} stablecoins with DEX liquidity`);

  // --- 5. Compute scores and prepare DB writes ---
  const nowSec = Math.floor(Date.now() / 1000);
  const stmts: D1PreparedStatement[] = [];

  // Track scores for daily snapshot
  const scoreMap = new Map<string, { tvl: number; vol24h: number; score: number }>();

  for (const [id, m] of metrics) {
    // Compute HHI from full pool list BEFORE truncation
    let hhi = 0;
    if (m.totalTvlUsd > 0) {
      for (const p of m.topPools) {
        const share = p.tvlUsd / m.totalTvlUsd;
        hhi += share * share;
      }
    }

    // Sort and trim top pools to 10
    m.topPools.sort((a, b) => b.tvlUsd - a.tvlUsd);
    const topPools = m.topPools.slice(0, 10);

    const score = computeLiquidityScore(m);
    scoreMap.set(id, { tvl: m.totalTvlUsd, vol24h: m.totalVolume24hUsd, score });

    stmts.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO dex_liquidity
            (stablecoin_id, symbol, total_tvl_usd, total_volume_24h_usd, total_volume_7d_usd,
             pool_count, pair_count, chain_count, protocol_tvl_json, chain_tvl_json,
             top_pools_json, liquidity_score, concentration_hhi, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          m.symbol,
          m.totalTvlUsd,
          m.totalVolume24hUsd,
          m.totalVolume7dUsd,
          m.poolCount,
          m.pairs.size,
          m.chains.size,
          JSON.stringify(m.protocolTvl),
          JSON.stringify(m.chainTvl),
          JSON.stringify(topPools),
          score,
          Math.round(hhi * 10000) / 10000, // 4 decimal places
          nowSec
        )
    );
  }

  // Write zero-score rows for tracked stablecoins with no DEX presence
  for (const meta of TRACKED_STABLECOINS) {
    if (!metrics.has(meta.id)) {
      stmts.push(
        db
          .prepare(
            `INSERT OR REPLACE INTO dex_liquidity
              (stablecoin_id, symbol, total_tvl_usd, total_volume_24h_usd, total_volume_7d_usd,
               pool_count, pair_count, chain_count, protocol_tvl_json, chain_tvl_json,
               top_pools_json, liquidity_score, updated_at)
            VALUES (?, ?, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, 0, ?)`
          )
          .bind(meta.id, meta.symbol, nowSec)
      );
    }
  }

  // D1 batch limit is 100 statements — chunk
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }

  console.log(`[dex-liquidity] Wrote ${stmts.length} rows (${metrics.size} with data, ${stmts.length - metrics.size} zero)`);

  // --- 6. Daily snapshot for historical tracking ---
  // Write one snapshot per day (first sync invocation after UTC midnight)
  const todayMidnight = Math.floor(Date.now() / 86_400_000) * 86_400; // epoch seconds at UTC midnight
  try {
    const lastSnap = await db
      .prepare("SELECT MAX(snapshot_date) as last_date FROM dex_liquidity_history")
      .first<{ last_date: number | null }>();

    if (!lastSnap?.last_date || lastSnap.last_date < todayMidnight) {
      const snapStmts: D1PreparedStatement[] = [];
      for (const [id, data] of scoreMap) {
        snapStmts.push(
          db
            .prepare(
              `INSERT INTO dex_liquidity_history
                (stablecoin_id, total_tvl_usd, total_volume_24h_usd, liquidity_score, snapshot_date)
              VALUES (?, ?, ?, ?, ?)`
            )
            .bind(id, data.tvl, data.vol24h, data.score, todayMidnight)
        );
      }
      // Also insert zero rows for coins without DEX presence
      for (const meta of TRACKED_STABLECOINS) {
        if (!scoreMap.has(meta.id)) {
          snapStmts.push(
            db
              .prepare(
                `INSERT INTO dex_liquidity_history
                  (stablecoin_id, total_tvl_usd, total_volume_24h_usd, liquidity_score, snapshot_date)
                VALUES (?, 0, 0, 0, ?)`
              )
              .bind(meta.id, todayMidnight)
          );
        }
      }
      for (let i = 0; i < snapStmts.length; i += 100) {
        await db.batch(snapStmts.slice(i, i + 100));
      }
      console.log(`[dex-liquidity] Wrote daily snapshot (${snapStmts.length} rows) for ${new Date(todayMidnight * 1000).toISOString().slice(0, 10)}`);
    }
  } catch (err) {
    console.warn("[dex-liquidity] Daily snapshot failed:", err);
  }

  // --- 7. Compute depth stability from 30-day history ---
  try {
    const thirtyDaysAgo = todayMidnight - 30 * 86_400;
    const histRows = await db
      .prepare(
        `SELECT stablecoin_id, total_tvl_usd
         FROM dex_liquidity_history
         WHERE snapshot_date >= ?
         ORDER BY stablecoin_id, snapshot_date`
      )
      .bind(thirtyDaysAgo)
      .all<{ stablecoin_id: string; total_tvl_usd: number }>();

    // Group by stablecoin
    const histByCoin = new Map<string, number[]>();
    for (const row of histRows.results ?? []) {
      const arr = histByCoin.get(row.stablecoin_id) ?? [];
      arr.push(row.total_tvl_usd);
      histByCoin.set(row.stablecoin_id, arr);
    }

    const stabilityStmts: D1PreparedStatement[] = [];
    for (const [id, tvls] of histByCoin) {
      if (tvls.length < 7) continue; // Need at least 7 days for meaningful stability
      const mean = tvls.reduce((s, v) => s + v, 0) / tvls.length;
      if (mean <= 0) continue;
      const variance = tvls.reduce((s, v) => s + (v - mean) ** 2, 0) / tvls.length;
      const stddev = Math.sqrt(variance);
      const cv = stddev / mean;
      const stability = Math.round((1 - Math.min(1, cv)) * 10000) / 10000;
      stabilityStmts.push(
        db.prepare("UPDATE dex_liquidity SET depth_stability = ? WHERE stablecoin_id = ?").bind(stability, id)
      );
    }
    if (stabilityStmts.length > 0) {
      for (let i = 0; i < stabilityStmts.length; i += 100) {
        await db.batch(stabilityStmts.slice(i, i + 100));
      }
      console.log(`[dex-liquidity] Updated depth stability for ${stabilityStmts.length} coins`);
    }
  } catch (err) {
    console.warn("[dex-liquidity] Depth stability computation failed:", err);
  }
}
