# DEX Liquidity v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the DEX liquidity scoring system with pool health signals, pairing quality, organic vs incentivized liquidity detection, CL fee tier corrections, metapool TVL dedup, and data quality filters — all at zero additional API cost.

**Architecture:** Incremental enhancement of the existing `syncDexLiquidity()` in `worker/src/cron/sync-dex-liquidity.ts`. Expand the data captured from existing API responses, add new derived metrics, update the composite score to 6 components, surface enriched data through `worker/src/api/dex-liquidity.ts`, and update the frontend card + leaderboard.

**Tech Stack:** Cloudflare Workers (D1 SQLite), TypeScript, Next.js 16, React 19, TanStack Query, Recharts, shadcn/ui, Tailwind CSS v4

**Design doc:** `docs/plans/2026-02-19-dex-liquidity-v2-design.md`

---

## Task 1: D1 Migration — New Columns

**Files:**
- Create: `worker/migrations/0012_dex_liquidity_v2.sql`

**Step 1: Write the migration file**

```sql
-- DEX Liquidity v2: enhanced metrics columns
ALTER TABLE dex_liquidity ADD COLUMN avg_pool_stress REAL;
ALTER TABLE dex_liquidity ADD COLUMN weighted_balance_ratio REAL;
ALTER TABLE dex_liquidity ADD COLUMN organic_fraction REAL;
ALTER TABLE dex_liquidity ADD COLUMN effective_tvl_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE dex_liquidity ADD COLUMN durability_score INTEGER;
ALTER TABLE dex_liquidity ADD COLUMN score_components_json TEXT;
```

**Step 2: Apply migration locally**

Run: `cd worker && npx wrangler d1 migrations apply stablecoin-db --local`
Expected: Migration applied successfully

**Step 3: Verify columns exist**

Run: `cd worker && npx wrangler d1 execute stablecoin-db --local --command "PRAGMA table_info(dex_liquidity)"`
Expected: New columns appear in the output

**Step 4: Commit**

```bash
git add worker/migrations/0012_dex_liquidity_v2.sql
git commit -m "feat(worker): add D1 migration for DEX liquidity v2 columns"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/lib/types.ts:216-269` (DexLiquidityPool, DexLiquidityData interfaces)

**Step 1: Update `DexLiquidityPool.extra` type (line 224-228)**

Add the new optional fields to the `extra` object in `DexLiquidityPool`:

```typescript
export interface DexLiquidityPool {
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
    effectiveTvl?: number;
    organicFraction?: number;
    pairQuality?: number;
    stressIndex?: number;
    isMetaPool?: boolean;
    maturityDays?: number;
    registryId?: string;
    balanceDetails?: {
      symbol: string;
      balancePct: number;
      isTracked: boolean;
    }[];
  };
}
```

**Step 2: Update `DexLiquidityData` (line 239-260)**

Add new fields after the existing ones:

```typescript
export interface DexLiquidityData {
  totalTvlUsd: number;
  totalVolume24hUsd: number;
  totalVolume7dUsd: number;
  poolCount: number;
  pairCount: number;
  chainCount: number;
  protocolTvl: Record<string, number>;
  chainTvl: Record<string, number>;
  topPools: DexLiquidityPool[];
  liquidityScore: number | null;
  concentrationHhi: number | null;
  depthStability: number | null;
  tvlChange24h: number | null;
  tvlChange7d: number | null;
  updatedAt: number;
  dexPriceUsd: number | null;
  dexDeviationBps: number | null;
  priceSourceCount: number | null;
  priceSourceTvl: number | null;
  priceSources: DexPriceSource[] | null;
  // v2 fields
  effectiveTvlUsd: number;
  avgPoolStress: number | null;
  weightedBalanceRatio: number | null;
  organicFraction: number | null;
  durabilityScore: number | null;
  scoreComponents: {
    tvlDepth: number;
    volumeActivity: number;
    poolQuality: number;
    durability: number;
    pairDiversity: number;
    crossChain: number;
  } | null;
}
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: FAIL — the worker sync and API code now don't satisfy the new types. That's expected at this stage (types are the contract; implementation follows).

**Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add DEX liquidity v2 type definitions"
```

---

## Task 3: Enhanced Data Capture — Interfaces & Parsing

This is the core worker change. Modifies `worker/src/cron/sync-dex-liquidity.ts`.

**Files:**
- Modify: `worker/src/cron/sync-dex-liquidity.ts:42-110` (constants, interfaces)

**Step 1: Update QUALITY_MULTIPLIERS (lines 42-51)**

Replace the existing map with v2 multipliers:

```typescript
const QUALITY_MULTIPLIERS: Record<string, number> = {
  "curve-stableswap-high-a": 1.0,
  "curve-stableswap": 0.85,
  "curve-cryptoswap": 0.5,
  "uniswap-v3-1bp": 1.1,
  "uniswap-v3-5bp": 0.85,
  "uniswap-v3-30bp": 0.4,
  "fluid-dex": 0.85,
  "balancer-stable": 0.85,
  "balancer-weighted": 0.4,
  "generic": 0.3,
};
```

**Step 2: Update LlamaPool interface (lines 53-63)**

Add the 5 new fields:

```typescript
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
  // v2 fields
  apyBase: number | null;
  apyReward: number | null;
  apy: number;
  sigma: number;
  exposure: string;
  count: number;
}
```

**Step 3: Update CurvePool interface (lines 65-74)**

Add new fields:

```typescript
interface CurvePool {
  address: string;
  name: string;
  amplificationCoefficient: string;
  coins: {
    symbol: string;
    address: string;
    poolBalance: string;
    usdPrice: number;
    decimals: string;
    isBasePoolLpToken?: boolean;
  }[];
  usdTotal: number;
  isMetaPool: boolean;
  assetTypeName: string;
  totalSupply: number;
  // v2 fields
  registryId: string;
  isBroken: boolean;
  virtualPrice: string;
  usdTotalExcludingBasePool: number;
  creationTs: number;
  basePoolAddress: string | null;
  gaugeCrvApy: [number, number] | null;
}
```

**Step 4: Update PoolEntry interface (lines 91-103)**

Expand `extra` to match the enriched fields from the design:

```typescript
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
    effectiveTvl?: number;
    organicFraction?: number;
    pairQuality?: number;
    stressIndex?: number;
    isMetaPool?: boolean;
    maturityDays?: number;
    registryId?: string;
    balanceDetails?: {
      symbol: string;
      balancePct: number;
      isTracked: boolean;
    }[];
  };
}
```

**Step 5: Update LiquidityMetrics interface (lines 76-89)**

Add new tracking fields:

```typescript
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
  // v2 fields
  effectiveTvl: number;
  organicTvlWeightedSum: number;  // sum(pool.tvl * organicFraction)
  totalTvlForOrganic: number;     // sum(pool.tvl) where organic data available
  balanceRatioWeightedSum: number; // sum(pool.tvl * balanceRatio)
  totalTvlForBalance: number;     // sum(pool.tvl) where balance data available
  stressWeightedSum: number;       // sum(pool.tvl * stressIndex)
  oldestPoolDays: number;          // max pool age in days
}
```

**Step 6: Update initMetrics function (lines 190-205)**

Add new fields with defaults:

```typescript
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
    effectiveTvl: 0,
    organicTvlWeightedSum: 0,
    totalTvlForOrganic: 0,
    balanceRatioWeightedSum: 0,
    totalTvlForBalance: 0,
    stressWeightedSum: 0,
    oldestPoolDays: 0,
  };
}
```

**Step 7: Commit**

```bash
git add worker/src/cron/sync-dex-liquidity.ts
git commit -m "feat(worker): update interfaces and constants for DEX liquidity v2"
```

---

## Task 4: Pairing Quality & Helper Functions

**Files:**
- Modify: `worker/src/cron/sync-dex-liquidity.ts` (add new helper functions before `syncDexLiquidity`)

**Step 1: Add VOLATILE_PAIR_QUALITY constant and getPairQuality function**

Add after `normalizeProtocol` (after line 219):

```typescript
/** Quality score for non-stablecoin pairing assets */
const VOLATILE_PAIR_QUALITY: Record<string, number> = {
  WETH: 0.65, ETH: 0.65, STETH: 0.65, WSTETH: 0.65,
  WBTC: 0.6, TBTC: 0.55, CBBTC: 0.6,
};

/** Build a symbol → governance type lookup from TRACKED_STABLECOINS */
const SYMBOL_GOVERNANCE = new Map<string, string>();
for (const meta of TRACKED_STABLECOINS) {
  SYMBOL_GOVERNANCE.set(meta.symbol.toUpperCase(), meta.governance);
}

/**
 * Get pairing quality score for a token symbol.
 * Uses Pharos classification for tracked stablecoins, static map for known volatile assets.
 */
function getPairQuality(symbol: string): number {
  const gov = SYMBOL_GOVERNANCE.get(symbol.toUpperCase());
  if (gov) {
    if (gov === "centralized") return 1.0;
    if (gov === "decentralized") return 0.9;
    if (gov === "centralized-dependent") return 0.8;
    return 0.7;
  }
  return VOLATILE_PAIR_QUALITY[symbol.toUpperCase()] ?? 0.3;
}

/**
 * Compute pair quality for a stablecoin in a multi-asset pool.
 * Returns the best quality among co-tokens (one good exit suffices).
 */
function computePoolPairQuality(poolSymbols: string[], stablecoinSymbol: string): number {
  let best = 0;
  for (const sym of poolSymbols) {
    if (sym.toUpperCase() === stablecoinSymbol.toUpperCase()) continue;
    best = Math.max(best, getPairQuality(sym));
  }
  return best || 0.3; // fallback if no co-tokens found
}

/**
 * Compute pool stress index (0-100, higher = more stressed).
 */
function computePoolStress(
  balanceRatio: number,
  organicFraction: number,
  maturityDays: number,
  pairQuality: number,
): number {
  const immaturityPenalty = Math.max(0, 1 - maturityDays / 365);
  const raw =
    35 * (1 - balanceRatio) +
    25 * (1 - organicFraction) +
    20 * immaturityPenalty +
    20 * (1 - pairQuality);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Check if a Curve registryId indicates a CryptoSwap pool */
function isCryptoSwap(registryId: string): boolean {
  const r = registryId.toLowerCase();
  return r.includes("crypto") || r.includes("twocrypto") || r.includes("tricrypto");
}
```

**Step 2: Update classifyPoolType (lines 128-139)**

Add Balancer weighted detection:

```typescript
function classifyPoolType(project: string, _symbol: string): string {
  const proj = project.toLowerCase();
  if (proj.includes("curve")) return "curve-stableswap"; // refined later via registryId
  if (proj.includes("fluid")) return "fluid-dex";
  if (proj.includes("balancer") && proj.includes("stable")) return "balancer-stable";
  if (proj.includes("balancer")) return "balancer-weighted";
  if (proj.includes("uniswap-v3") || proj === "uniswap-v3") return "uniswap-v3-5bp";
  return "generic";
}
```

**Step 3: Commit**

```bash
git add worker/src/cron/sync-dex-liquidity.ts
git commit -m "feat(worker): add pair quality, pool stress, and CryptoSwap helpers"
```

---

## Task 5: Enhanced Data Quality Filters

**Files:**
- Modify: `worker/src/cron/sync-dex-liquidity.ts:244-262` (protocol parsing)
- Modify: `worker/src/cron/sync-dex-liquidity.ts:274-342` (Curve parsing)
- Modify: `worker/src/cron/sync-dex-liquidity.ts:402-404` (pool filter loop)

**Step 1: Update protocol parsing to filter dead/rugged (lines 244-255)**

Replace the protocol parsing block:

```typescript
  // Build set of project slugs categorized as "Dexs" by DeFiLlama
  const dexProjects = new Set<string>();
  if (protocolsRes?.ok) {
    const protocols = (await protocolsRes.json()) as {
      slug: string;
      category?: string;
      deadFrom?: number | null;
      rugged?: boolean | null;
      deprecated?: boolean | null;
    }[];
    for (const p of protocols) {
      if (p.category !== "Dexs") continue;
      // v2: skip dead, rugged, or deprecated protocols
      if (p.deadFrom || p.rugged || p.deprecated) continue;
      dexProjects.add(p.slug);
    }
    console.log(`[dex-liquidity] Indexed ${dexProjects.size} active DEX projects from DeFiLlama protocols`);
  } else {
    console.error("[dex-liquidity] DeFiLlama protocols fetch failed — cannot filter DEX pools, aborting");
    return;
  }
```

**Step 2: Update Curve parsing to capture new fields and filter broken pools (lines 274-342)**

The Curve parsing loop needs several additions:
- Skip `isBroken` pools
- Store `registryId` in the curvePoolMap
- Use `usdTotalExcludingBasePool` for metapools
- Capture per-coin balance details
- Capture `creationTs` for maturity

Extend the curvePoolMap value type and parsing loop. The curvePoolMap should now store:

```typescript
  const curvePoolMap = new Map<string, {
    A: number;
    balanceRatio: number;
    tvl: number;
    registryId: string;
    isMetaPool: boolean;
    metapoolAdjustedTvl: number;
    creationTs: number;
    balanceDetails: { symbol: string; balancePct: number; isTracked: boolean }[];
  }>();
```

Inside the Curve pool parsing loop, add:
- `if (pool.isBroken) continue;` at the top
- Compute `metapoolAdjustedTvl`: use `pool.usdTotalExcludingBasePool` when `pool.basePoolAddress` is non-null and the value is > 0, otherwise fall back to `pool.usdTotal`
- Build `balanceDetails` from the coin balances: for each coin, compute its USD balance as fraction of total, and check if `symbolToIdsEarly` has it
- Store `registryId`, `isMetaPool`, `metapoolAdjustedTvl`, `creationTs`, and `balanceDetails` in the map entry
- For DEX price observations, use `metapoolAdjustedTvl` as the TVL weight

**Step 3: Update the pool filter in the main DeFiLlama loop (lines 402-404)**

Add the lending pool filter:

```typescript
  for (const pool of pools) {
    if (!pool.tvlUsd || pool.tvlUsd < 10_000) continue;
    if (!dexProjects.has(pool.project)) continue;
    // v2: skip lending pools (single-asset exposure)
    if (pool.exposure === "single") continue;
```

**Step 4: Commit**

```bash
git add worker/src/cron/sync-dex-liquidity.ts
git commit -m "feat(worker): add data quality filters — broken, dead, lending exclusions"
```

---

## Task 6: Enhanced Pool Processing Loop

This is the largest change — updating the pool matching and quality computation loop (lines 416-499).

**Files:**
- Modify: `worker/src/cron/sync-dex-liquidity.ts:416-499`

**Step 1: Update Curve quality multiplier logic (lines 427-456)**

When `curveData` exists:
- Use `registryId` to check for CryptoSwap: if `isCryptoSwap(curveData.registryId)`, set `resolvedPoolType = "curve-cryptoswap"` and use that multiplier (0.5)
- Otherwise, keep the existing A>=500 logic but with the updated multiplier values
- Replace the binary `balanceRatio < 0.3 → 0.5x` with the continuous `balanceRatio^1.5` adjustment
- Compute pair quality for this pool using `computePoolPairQuality`
- Compute effective TVL: `pool.tvlUsd` (or `curveData.metapoolAdjustedTvl` for Curve pools) × mechanismMult × balanceHealthScore × pairQuality

The new quality multiplier block:

```typescript
    let qualMult: number;
    let resolvedPoolType = poolType;
    let feeTierForExtra: number | undefined;
    let balanceRatio = 1;
    let balanceHealth = 1;
    let pairQuality = 0.3;
    let poolMaturityDays = 0;
    let organicFraction = 0.5; // neutral default
    let effectivePoolTvl = pool.tvlUsd;
    let balanceDetails: { symbol: string; balancePct: number; isTracked: boolean }[] | undefined;

    if (curveData) {
      balanceRatio = curveData.balanceRatio;
      balanceHealth = Math.pow(balanceRatio, 1.5);
      balanceDetails = curveData.balanceDetails;
      // v2: CryptoSwap vs StableSwap
      if (isCryptoSwap(curveData.registryId)) {
        resolvedPoolType = "curve-cryptoswap";
        qualMult = QUALITY_MULTIPLIERS["curve-cryptoswap"]!;
      } else {
        resolvedPoolType = curveData.A >= 500 ? "curve-stableswap-high-a" : "curve-stableswap";
        qualMult = getQualityMultiplier(resolvedPoolType, curveData.A);
      }
      // Use metapool-adjusted TVL
      effectivePoolTvl = curveData.metapoolAdjustedTvl;
      // Pool maturity from Curve creation timestamp
      if (curveData.creationTs > 0) {
        poolMaturityDays = Math.floor((Date.now() / 1000 - curveData.creationTs) / 86400);
      }
    } else if (poolType === "uniswap-v3-5bp" && uniV3PoolFees.size > 0) {
      // ... existing fee tier resolution logic (unchanged) ...
      qualMult = getQualityMultiplier(resolvedPoolType);
    } else {
      qualMult = getQualityMultiplier(poolType);
    }

    // Pair quality (applicable to all pools)
    pairQuality = computePoolPairQuality(poolSymbols, ""); // computed per stablecoin below

    // Organic fraction from DeFiLlama APY data
    if (pool.apyBase != null && pool.apy > 0.01) {
      organicFraction = Math.min(1, Math.max(0, pool.apyBase / pool.apy));
    } else if (pool.apyBase != null) {
      organicFraction = pool.apyBase > 0 ? 1.0 : 0;
    }
    // else stays 0.5 (neutral)

    // Pool maturity from DeFiLlama count (fallback for non-Curve)
    if (poolMaturityDays === 0 && pool.count > 0) {
      poolMaturityDays = pool.count; // ~1 data point per day
    }
```

**Step 2: Update the per-stablecoin accumulation loop (lines 458-499)**

For each matched stablecoin ID, compute per-stablecoin pair quality and accumulate the new metrics:

```typescript
    for (const id of matchedIds) {
      const meta = TRACKED_STABLECOINS.find((s) => s.id === id);
      if (!meta) continue;

      let m = metrics.get(id);
      if (!m) {
        m = initMetrics(id, meta.symbol);
        metrics.set(id, m);
      }

      // Per-stablecoin pair quality
      const coinPairQuality = computePoolPairQuality(poolSymbols, meta.symbol);

      // Combined pool quality (mechanism × balance × pair)
      const combinedQuality = qualMult * balanceHealth * coinPairQuality;
      const poolEffTvl = effectivePoolTvl * combinedQuality;

      // Pool stress for this pool
      const stressIdx = computePoolStress(balanceRatio, organicFraction, poolMaturityDays, coinPairQuality);

      m.totalTvlUsd += pool.tvlUsd;
      m.totalVolume24hUsd += vol1d;
      m.totalVolume7dUsd += vol7d;
      m.poolCount++;
      m.chains.add(pool.chain);
      m.pairs.add(pool.symbol);
      m.qualityAdjustedTvl += pool.tvlUsd * qualMult * balanceHealth;
      m.effectiveTvl += poolEffTvl;

      // Weighted balance ratio tracking
      if (curveData) {
        m.balanceRatioWeightedSum += pool.tvlUsd * balanceRatio;
        m.totalTvlForBalance += pool.tvlUsd;
      }

      // Weighted organic fraction tracking
      if (pool.apyBase != null) {
        m.organicTvlWeightedSum += pool.tvlUsd * organicFraction;
        m.totalTvlForOrganic += pool.tvlUsd;
      }

      // Stress tracking (TVL-weighted)
      m.stressWeightedSum += pool.tvlUsd * stressIdx;

      // Track oldest pool
      m.oldestPoolDays = Math.max(m.oldestPoolDays, poolMaturityDays);

      // Protocol and chain TVL
      m.protocolTvl[protocol] = (m.protocolTvl[protocol] ?? 0) + pool.tvlUsd;
      m.chainTvl[pool.chain] = (m.chainTvl[pool.chain] ?? 0) + pool.tvlUsd;

      // Pool entry with enriched extra
      m.topPools.push({
        project: pool.project,
        chain: pool.chain,
        tvlUsd: pool.tvlUsd,
        symbol: pool.symbol,
        volumeUsd1d: vol1d,
        poolType: resolvedPoolType,
        extra: {
          ...(curveData
            ? {
                amplificationCoefficient: curveData.A,
                balanceRatio: Math.round(balanceRatio * 100) / 100,
                registryId: curveData.registryId,
                isMetaPool: curveData.isMetaPool,
                balanceDetails,
              }
            : feeTierForExtra != null
              ? { feeTier: feeTierForExtra }
              : {}),
          effectiveTvl: Math.round(poolEffTvl),
          organicFraction: Math.round(organicFraction * 100) / 100,
          pairQuality: Math.round(coinPairQuality * 100) / 100,
          stressIndex: stressIdx,
          maturityDays: poolMaturityDays,
        },
      });
    }
```

**Step 3: Commit**

```bash
git add worker/src/cron/sync-dex-liquidity.ts
git commit -m "feat(worker): enhanced pool processing with quality, balance, pairing, stress"
```

---

## Task 7: Rebalanced Composite Score (6 Components)

**Files:**
- Modify: `worker/src/cron/sync-dex-liquidity.ts:149-188` (computeLiquidityScore)

**Step 1: Rewrite computeLiquidityScore**

Replace the 5-component function with 6 components:

```typescript
interface ScoreComponents {
  tvlDepth: number;
  volumeActivity: number;
  poolQuality: number;
  durability: number;
  pairDiversity: number;
  crossChain: number;
}

function computeLiquidityScore(
  m: LiquidityMetrics,
  durabilityScore: number,
): { score: number; components: ScoreComponents } {
  // Component 1: TVL depth (30%) — now uses effectiveTvl
  const tvlInput = m.effectiveTvl > 0 ? m.effectiveTvl : m.totalTvlUsd;
  const tvlDepth = Math.min(
    100,
    Math.max(0, 20 * Math.log10(Math.max(tvlInput, 1) / 100_000) + 20),
  );

  // Component 2: Volume activity (20%)
  const vtRatio = m.totalTvlUsd > 0 ? m.totalVolume24hUsd / m.totalTvlUsd : 0;
  const volumeActivity = Math.min(100, vtRatio * 200);

  // Component 3: Pool quality (20%) — quality-adjusted TVL on same log scale
  const poolQuality = Math.min(
    100,
    Math.max(0, 20 * Math.log10(Math.max(m.qualityAdjustedTvl, 1) / 100_000) + 20),
  );

  // Component 4: Durability (15%) — passed in from durability computation
  const durability = durabilityScore;

  // Component 5: Pair diversity (7.5%)
  const pairDiversity = Math.min(100, m.poolCount * 5);

  // Component 6: Cross-chain presence (7.5%)
  const chainCount = m.chains.size;
  const crossChain = chainCount <= 1
    ? 15
    : Math.min(100, 15 + (chainCount - 1) * 12);

  const raw =
    tvlDepth * 0.30 +
    volumeActivity * 0.20 +
    poolQuality * 0.20 +
    durability * 0.15 +
    pairDiversity * 0.075 +
    crossChain * 0.075;

  const components: ScoreComponents = {
    tvlDepth: Math.round(tvlDepth),
    volumeActivity: Math.round(volumeActivity),
    poolQuality: Math.round(poolQuality),
    durability: Math.round(durability),
    pairDiversity: Math.round(pairDiversity),
    crossChain: Math.round(crossChain),
  };

  return {
    score: Math.max(0, Math.min(100, Math.round(raw))),
    components,
  };
}
```

**Step 2: Add durability computation function**

Add before `computeLiquidityScore`:

```typescript
/**
 * Compute durability score for a stablecoin (0-100).
 * 40% organic fraction, 25% TVL stability, 20% volume consistency, 15% maturity.
 */
function computeDurabilityScore(
  m: LiquidityMetrics,
  tvlStability: number | null,
  volumeStability: number | null,
): number {
  // Organic fraction sub-score
  const organicFraction = m.totalTvlForOrganic > 0
    ? m.organicTvlWeightedSum / m.totalTvlForOrganic
    : 0.5;
  const organicScore = Math.min(100, organicFraction * 125);

  // TVL stability sub-score (from depth_stability, 0-1)
  const tvlStabilityScore = tvlStability != null ? tvlStability * 100 : 50;

  // Volume consistency sub-score
  const volumeConsistencyScore = volumeStability != null ? volumeStability * 100 : 50;

  // Maturity sub-score
  const maturityScore = Math.min(100, (m.oldestPoolDays / 365) * 100);

  return Math.max(0, Math.min(100, Math.round(
    organicScore * 0.40 +
    tvlStabilityScore * 0.25 +
    volumeConsistencyScore * 0.20 +
    maturityScore * 0.15
  )));
}
```

**Step 3: Commit**

```bash
git add worker/src/cron/sync-dex-liquidity.ts
git commit -m "feat(worker): rebalanced 6-component liquidity score with durability"
```

---

## Task 8: Score Computation & DB Write Updates

**Files:**
- Modify: `worker/src/cron/sync-dex-liquidity.ts:504-578` (score loop + DB writes)

**Step 1: Update the score computation loop (section 5)**

The loop at lines 504-554 needs to:
1. Read depth_stability and volume stability from DB BEFORE the scoring loop
2. Compute durability per stablecoin
3. Call the new `computeLiquidityScore` with durability
4. Compute weighted averages for balance ratio, organic fraction, pool stress
5. Write the new columns to D1

Query existing depth_stability and volume history before the loop:

```typescript
  // Pre-fetch depth stability for durability computation
  const stabilityMap = new Map<string, number>();
  try {
    const stabRows = await db
      .prepare("SELECT stablecoin_id, depth_stability FROM dex_liquidity WHERE depth_stability IS NOT NULL")
      .all<{ stablecoin_id: string; depth_stability: number }>();
    for (const row of stabRows.results ?? []) {
      stabilityMap.set(row.stablecoin_id, row.depth_stability);
    }
  } catch { /* first run has no data */ }

  // Pre-fetch volume history for volume consistency (CV of 30-day volumes)
  const volumeStabilityMap = new Map<string, number>();
  try {
    const thirtyDaysAgo = Math.floor(Date.now() / 86_400_000) * 86_400 - 30 * 86_400;
    const volRows = await db
      .prepare(
        `SELECT stablecoin_id, total_volume_24h_usd
         FROM dex_liquidity_history
         WHERE snapshot_date >= ?
         ORDER BY stablecoin_id, snapshot_date`
      )
      .bind(thirtyDaysAgo)
      .all<{ stablecoin_id: string; total_volume_24h_usd: number }>();
    const volByCoin = new Map<string, number[]>();
    for (const row of volRows.results ?? []) {
      const arr = volByCoin.get(row.stablecoin_id) ?? [];
      arr.push(row.total_volume_24h_usd);
      volByCoin.set(row.stablecoin_id, arr);
    }
    for (const [id, vols] of volByCoin) {
      if (vols.length < 7) continue;
      const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
      if (mean <= 0) continue;
      const variance = vols.reduce((s, v) => s + (v - mean) ** 2, 0) / vols.length;
      const cv = Math.sqrt(variance) / mean;
      volumeStabilityMap.set(id, Math.round((1 - Math.min(1, cv)) * 10000) / 10000);
    }
  } catch { /* first run has no data */ }
```

Then update the scoring loop:

```typescript
  for (const [id, m] of metrics) {
    // HHI computation (unchanged)
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

    // Compute durability
    const tvlStab = stabilityMap.get(id) ?? null;
    const volStab = volumeStabilityMap.get(id) ?? null;
    const durability = computeDurabilityScore(m, tvlStab, volStab);

    // Compute 6-component score
    const { score, components } = computeLiquidityScore(m, durability);
    scoreMap.set(id, { tvl: m.totalTvlUsd, vol24h: m.totalVolume24hUsd, score });

    // Compute aggregate metrics
    const weightedBalanceRatio = m.totalTvlForBalance > 0
      ? Math.round((m.balanceRatioWeightedSum / m.totalTvlForBalance) * 10000) / 10000
      : null;
    const organicFrac = m.totalTvlForOrganic > 0
      ? Math.round((m.organicTvlWeightedSum / m.totalTvlForOrganic) * 10000) / 10000
      : null;
    const avgStress = m.totalTvlUsd > 0
      ? Math.round((m.stressWeightedSum / m.totalTvlUsd) * 100) / 100
      : null;

    stmts.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO dex_liquidity
            (stablecoin_id, symbol, total_tvl_usd, total_volume_24h_usd, total_volume_7d_usd,
             pool_count, pair_count, chain_count, protocol_tvl_json, chain_tvl_json,
             top_pools_json, liquidity_score, concentration_hhi,
             avg_pool_stress, weighted_balance_ratio, organic_fraction,
             effective_tvl_usd, durability_score, score_components_json,
             updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          Math.round(hhi * 10000) / 10000,
          avgStress,
          weightedBalanceRatio,
          organicFrac,
          Math.round(m.effectiveTvl),
          durability,
          JSON.stringify(components),
          nowSec,
        ),
    );
  }
```

**Step 2: Update the zero-score rows to include new columns (lines 557-571)**

```typescript
  for (const meta of TRACKED_STABLECOINS) {
    if (!metrics.has(meta.id)) {
      stmts.push(
        db
          .prepare(
            `INSERT OR REPLACE INTO dex_liquidity
              (stablecoin_id, symbol, total_tvl_usd, total_volume_24h_usd, total_volume_7d_usd,
               pool_count, pair_count, chain_count, protocol_tvl_json, chain_tvl_json,
               top_pools_json, liquidity_score, effective_tvl_usd, updated_at)
            VALUES (?, ?, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, 0, 0, ?)`
          )
          .bind(meta.id, meta.symbol, nowSec),
      );
    }
  }
```

**Step 3: Commit**

```bash
git add worker/src/cron/sync-dex-liquidity.ts
git commit -m "feat(worker): updated score computation and DB writes for v2 columns"
```

---

## Task 9: Update API Endpoint

**Files:**
- Modify: `worker/src/api/dex-liquidity.ts` (111 lines)

**Step 1: Add new fields to the API response transformation (lines 73-94)**

Update the output object construction to include the new columns:

Add these lines inside the per-row mapping, after the existing fields:

```typescript
    // v2 fields
    effectiveTvlUsd: row.effective_tvl_usd ?? 0,
    avgPoolStress: row.avg_pool_stress ?? null,
    weightedBalanceRatio: row.weighted_balance_ratio ?? null,
    organicFraction: row.organic_fraction ?? null,
    durabilityScore: row.durability_score ?? null,
    scoreComponents: row.score_components_json
      ? (() => { try { return JSON.parse(row.score_components_json); } catch { return null; } })()
      : null,
```

**Step 2: Verify the endpoint works**

Run: `cd worker && npx tsc --noEmit`
Expected: PASS (or only pre-existing warnings)

**Step 3: Commit**

```bash
git add worker/src/api/dex-liquidity.ts
git commit -m "feat(worker): expose v2 liquidity fields in API response"
```

---

## Task 10: Frontend — Detail Page Card Enhancements

**Files:**
- Modify: `src/components/dex-liquidity-card.tsx` (399 lines)

This task adds the following to the detail card:
1. Score component breakdown (6 bars)
2. Balance ratio column in top pools table
3. Pool stress indicator
4. Organic badge per pool
5. Durability badge
6. Effective TVL display

**Step 1: Add ScoreBreakdown component**

Add a new component after `TvlTrendChart` (after line 263):

```typescript
/** 6-bar horizontal breakdown of score components */
function ScoreBreakdown({ components }: {
  components: DexLiquidityData["scoreComponents"];
}) {
  if (!components) return null;
  const bars = [
    { label: "TVL Depth", value: components.tvlDepth, weight: "30%" },
    { label: "Volume", value: components.volumeActivity, weight: "20%" },
    { label: "Pool Quality", value: components.poolQuality, weight: "20%" },
    { label: "Durability", value: components.durability, weight: "15%" },
    { label: "Diversity", value: components.pairDiversity, weight: "7.5%" },
    { label: "Cross-chain", value: components.crossChain, weight: "7.5%" },
  ];
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">Score Breakdown</h4>
      {bars.map(({ label, value, weight }) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-24 text-muted-foreground shrink-0">{label} <span className="opacity-60">({weight})</span></span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${
                value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${value}%` }}
            />
          </div>
          <span className="w-8 text-right font-mono tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Add DurabilityBadge and BalanceIndicator helpers**

```typescript
function DurabilityBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const label = score >= 70 ? "Durable" : score >= 40 ? "Moderate" : "Fragile";
  const color = score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-red-500";
  return <span className={`text-xs font-medium ${color}`}>{label} ({score})</span>;
}

function BalanceBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  const color = ratio >= 0.8 ? "bg-emerald-500" : ratio >= 0.5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono tabular-nums text-xs">{pct}%</span>
    </div>
  );
}

function OrganicBadge({ fraction }: { fraction: number | undefined }) {
  if (fraction == null) return null;
  const label = fraction >= 0.7 ? "Organic" : fraction >= 0.3 ? "Mixed" : "Farmed";
  const color = fraction >= 0.7
    ? "text-emerald-600 bg-emerald-500/10"
    : fraction >= 0.3
      ? "text-amber-600 bg-amber-500/10"
      : "text-red-600 bg-red-500/10";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>
      {label}
    </span>
  );
}

function StressDot({ stress }: { stress: number | undefined }) {
  if (stress == null) return null;
  const color = stress <= 30 ? "bg-emerald-500" : stress <= 60 ? "bg-amber-500" : "bg-red-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={`Stress: ${stress}/100`} />;
}
```

**Step 3: Update TopPoolsTable (lines 164-206)**

Add Balance, Stress, and Organic columns:

```typescript
function TopPoolsTable({ pools }: { pools: DexLiquidityPool[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs border-b">
            <th className="text-left py-2 pr-2">Pool</th>
            <th className="text-left py-2 px-2 hidden sm:table-cell">Chain</th>
            <th className="text-right py-2 px-2">TVL</th>
            <th className="text-right py-2 px-2 hidden md:table-cell">Balance</th>
            <th className="text-center py-2 px-2 hidden lg:table-cell">Health</th>
            <th className="text-right py-2 px-2 hidden lg:table-cell">24h Vol</th>
            <th className="text-right py-2 pl-2 hidden xl:table-cell">Detail</th>
          </tr>
        </thead>
        <tbody>
          {pools.slice(0, 5).map((pool, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-2 pr-2">
                <div className="flex items-center gap-1.5">
                  <StressDot stress={pool.extra?.stressIndex} />
                  <span className="font-medium">{pool.symbol}</span>
                  <span className="text-muted-foreground text-xs">({pool.project})</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <OrganicBadge fraction={pool.extra?.organicFraction} />
                </div>
              </td>
              <td className="py-2 px-2 hidden sm:table-cell">{pool.chain}</td>
              <td className="py-2 px-2 text-right font-mono tabular-nums">{formatCurrency(pool.tvlUsd)}</td>
              <td className="py-2 px-2 hidden md:table-cell text-right">
                {pool.extra?.balanceRatio != null ? (
                  <BalanceBar ratio={pool.extra.balanceRatio} />
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </td>
              <td className="py-2 px-2 hidden lg:table-cell text-center">
                {pool.extra?.balanceDetails ? (
                  <div className="text-[10px] text-muted-foreground">
                    {pool.extra.balanceDetails.map((d, j) => (
                      <span key={j} className={d.isTracked ? "font-medium text-foreground" : ""}>
                        {j > 0 && " · "}
                        {d.symbol} {Math.round(d.balancePct)}%
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </td>
              <td className="py-2 px-2 text-right font-mono tabular-nums hidden lg:table-cell">
                {formatCurrency(pool.volumeUsd1d)}
              </td>
              <td className="py-2 pl-2 text-right text-xs text-muted-foreground hidden xl:table-cell">
                {pool.extra?.amplificationCoefficient ? `A=${pool.extra.amplificationCoefficient}` : ""}
                {pool.extra?.feeTier ? `${pool.extra.feeTier / 100}bp` : ""}
                {pool.extra?.isMetaPool ? " meta" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 4: Update the main DexLiquidityCard component**

Add the new sections in the card body:
- After the metrics grid (line ~341), add effective TVL and durability
- After concentration indicators (line ~361), add aggregate balance and organic fraction
- Before TopPoolsTable, add ScoreBreakdown

In the metrics grid, change the TVL display to show effective TVL with raw TVL context:

```typescript
{/* After TVL metric */}
{data.effectiveTvlUsd > 0 && data.effectiveTvlUsd !== data.totalTvlUsd && (
  <div className="text-[10px] text-muted-foreground mt-0.5">
    Effective: {formatCurrency(data.effectiveTvlUsd)}
  </div>
)}
```

After the concentration section, add:

```typescript
{/* Durability and balance health */}
<div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
  {data.durabilityScore != null && (
    <div>
      <span className="text-muted-foreground">Durability: </span>
      <DurabilityBadge score={data.durabilityScore} />
    </div>
  )}
  {data.weightedBalanceRatio != null && (
    <div>
      <span className="text-muted-foreground">Pool Balance: </span>
      <BalanceBar ratio={data.weightedBalanceRatio} />
    </div>
  )}
  {data.organicFraction != null && (
    <div>
      <span className="text-muted-foreground">Organic: </span>
      <span className="font-mono tabular-nums">{Math.round(data.organicFraction * 100)}%</span>
    </div>
  )}
</div>
```

Add ScoreBreakdown before the chart:

```typescript
<ScoreBreakdown components={data.scoreComponents} />
```

**Step 5: Update DexLiquidityPool import**

Ensure the component imports `DexLiquidityData` as well (for `scoreComponents` type):

```typescript
import type { DexLiquidityPool, DexLiquidityData } from "@/lib/types";
```

**Step 6: Commit**

```bash
git add src/components/dex-liquidity-card.tsx
git commit -m "feat(ui): enhanced DEX liquidity card with health signals and score breakdown"
```

---

## Task 11: Frontend — Leaderboard Page Enhancements

**Files:**
- Modify: `src/app/liquidity/client.tsx` (608 lines)

**Step 1: Add new sort keys to SortKey type (line ~26)**

```typescript
type SortKey =
  | "score" | "tvl" | "effectiveTvl" | "tvlTrend" | "volume" | "volume7d"
  | "vtRatio" | "pools" | "chains" | "balance" | "organic" | "durability" | "stress";
```

**Step 2: Add new sort cases (inside the sort logic, lines ~224-268)**

Add cases for the new sort keys:

```typescript
case "effectiveTvl":
  return (aLiq?.effectiveTvlUsd ?? 0) - (bLiq?.effectiveTvlUsd ?? 0);
case "balance":
  return (aLiq?.weightedBalanceRatio ?? 0) - (bLiq?.weightedBalanceRatio ?? 0);
case "organic":
  return (aLiq?.organicFraction ?? 0) - (bLiq?.organicFraction ?? 0);
case "durability":
  return (aLiq?.durabilityScore ?? 0) - (bLiq?.durabilityScore ?? 0);
case "stress":
  return (aLiq?.avgPoolStress ?? 0) - (bLiq?.avgPoolStress ?? 0);
```

**Step 3: Update summary stats (lines ~300-340)**

Add aggregate pool health and organic liquidity stats to the `useMemo`:

```typescript
// Inside the existing useMemo for summary stats
let totalBalance = 0;
let balanceWeight = 0;
let totalOrganic = 0;
let organicWeight = 0;
// ... inside the loop over rows:
if (liq.weightedBalanceRatio != null) {
  totalBalance += liq.weightedBalanceRatio * liq.totalTvlUsd;
  balanceWeight += liq.totalTvlUsd;
}
if (liq.organicFraction != null) {
  totalOrganic += liq.organicFraction * liq.totalTvlUsd;
  organicWeight += liq.totalTvlUsd;
}
// After loop:
const avgBalance = balanceWeight > 0 ? totalBalance / balanceWeight : null;
const avgOrganic = organicWeight > 0 ? totalOrganic / organicWeight : null;
```

**Step 4: Add new summary cards**

After the existing 4 summary cards (line ~410), add 2 more cards in the same grid (change the grid to 6-col on xl or keep 4-col with the 2 new cards below):

```typescript
{avgBalance != null && (
  <Card className="border-l-[3px] border-l-cyan-500/60">
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">Avg Pool Balance</div>
      <div className="text-xl font-mono tabular-nums font-semibold mt-1">
        {Math.round(avgBalance * 100)}%
      </div>
    </CardContent>
  </Card>
)}
{avgOrganic != null && (
  <Card className="border-l-[3px] border-l-pink-500/60">
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">Organic Liquidity</div>
      <div className="text-xl font-mono tabular-nums font-semibold mt-1">
        {Math.round(avgOrganic * 100)}%
      </div>
    </CardContent>
  </Card>
)}
```

**Step 5: Add new table columns (after existing columns)**

After the "Top Protocol" column (around line 515), add new columns:

```typescript
<th className="text-right px-2 py-3 hidden xl:table-cell cursor-pointer select-none"
    onClick={() => toggleSort("effectiveTvl")} ...>
  Eff. TVL
</th>
<th className="text-right px-2 py-3 hidden xl:table-cell cursor-pointer select-none"
    onClick={() => toggleSort("balance")} ...>
  Balance
</th>
<th className="text-right px-2 py-3 hidden xl:table-cell cursor-pointer select-none"
    onClick={() => toggleSort("organic")} ...>
  Organic
</th>
<th className="text-right px-2 py-3 hidden xl:table-cell cursor-pointer select-none"
    onClick={() => toggleSort("durability")} ...>
  Durability
</th>
```

And corresponding cells in the table body:

```typescript
<td className="py-3 px-2 text-right font-mono tabular-nums hidden xl:table-cell">
  {liq?.effectiveTvlUsd ? formatCurrency(liq.effectiveTvlUsd) : "—"}
</td>
<td className="py-3 px-2 text-right hidden xl:table-cell">
  {liq?.weightedBalanceRatio != null
    ? <BalanceBar ratio={liq.weightedBalanceRatio} />
    : "—"}
</td>
<td className="py-3 px-2 text-right font-mono tabular-nums hidden xl:table-cell">
  {liq?.organicFraction != null ? `${Math.round(liq.organicFraction * 100)}%` : "—"}
</td>
<td className="py-3 px-2 text-right hidden xl:table-cell">
  {liq?.durabilityScore != null ? (
    <span className={`font-mono tabular-nums ${
      liq.durabilityScore >= 70 ? "text-emerald-500" :
      liq.durabilityScore >= 40 ? "text-amber-500" : "text-red-500"
    }`}>{liq.durabilityScore}</span>
  ) : "—"}
</td>
```

**Step 6: Add BalanceBar helper**

Copy the `BalanceBar` helper component into this file (or extract it to a shared location if you prefer; keeping it inline per DRY for now since both usages are small):

```typescript
function BalanceBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  const color = ratio >= 0.8 ? "bg-emerald-500" : ratio >= 0.5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono tabular-nums text-xs w-7 text-right">{pct}%</span>
    </div>
  );
}
```

**Step 7: Commit**

```bash
git add src/app/liquidity/client.tsx
git commit -m "feat(ui): enhanced liquidity leaderboard with balance, organic, durability columns"
```

---

## Task 12: Type-Check & Build Verification

**Files:** (none new)

**Step 1: Type-check the worker**

Run: `cd worker && npx tsc --noEmit`
Expected: PASS with no new errors

**Step 2: Type-check the frontend**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Build the frontend**

Run: `npm run build`
Expected: Static export succeeds with no errors

**Step 4: Lint**

Run: `npm run lint`
Expected: No new warnings or errors

**Step 5: Commit any fixes**

If any type errors or lint issues surfaced, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve type/lint issues from DEX liquidity v2"
```

---

## Task 13: Update CLAUDE.md & About Page

**Files:**
- Modify: `CLAUDE.md` (update DEX Liquidity Score section)
- Modify: `src/app/about/page.tsx` (mention new data sources/methodology)

**Step 1: Update CLAUDE.md's DEX Liquidity Score section**

Replace the existing component weight table with the v2 weights and add documentation for the new metrics (durability, effective TVL, pool stress, organic fraction, balance ratio).

**Step 2: Update the about page**

Add a brief mention of the enhanced methodology: pool quality now accounts for pairing asset quality, balance health, organic vs incentivized liquidity, metapool TVL deduplication, and CryptoSwap pool classification. Mention the 6-component composite score.

**Step 3: Commit**

```bash
git add CLAUDE.md src/app/about/page.tsx
git commit -m "docs: update CLAUDE.md and about page for DEX liquidity v2"
```

---

## Summary of All Tasks

| # | Task | Files Changed | Depends On |
|---|------|---------------|------------|
| 1 | D1 Migration | `worker/migrations/0012_dex_liquidity_v2.sql` | — |
| 2 | TypeScript Types | `src/lib/types.ts` | — |
| 3 | Interfaces & Constants | `worker/src/cron/sync-dex-liquidity.ts` | — |
| 4 | Helper Functions | `worker/src/cron/sync-dex-liquidity.ts` | 3 |
| 5 | Data Quality Filters | `worker/src/cron/sync-dex-liquidity.ts` | 3 |
| 6 | Pool Processing Loop | `worker/src/cron/sync-dex-liquidity.ts` | 4, 5 |
| 7 | Composite Score | `worker/src/cron/sync-dex-liquidity.ts` | 3 |
| 8 | Score & DB Writes | `worker/src/cron/sync-dex-liquidity.ts` | 6, 7 |
| 9 | API Endpoint | `worker/src/api/dex-liquidity.ts` | 1, 8 |
| 10 | Detail Card UI | `src/components/dex-liquidity-card.tsx` | 2, 9 |
| 11 | Leaderboard UI | `src/app/liquidity/client.tsx` | 2, 9 |
| 12 | Build Verification | — | All above |
| 13 | Documentation | `CLAUDE.md`, about page | 12 |

**Parallelizable groups:**
- Tasks 1, 2, 3 can be done in parallel (independent files)
- Tasks 4, 5 can be done in parallel (both depend on 3 only)
- Tasks 10, 11 can be done in parallel (both depend on 2 + 9)
