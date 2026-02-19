# DEX Liquidity Analysis v2 — Design Document

**Date:** 2026-02-19
**Status:** Approved
**Scope:** Enhanced DEX liquidity scoring with pool health signals, pairing quality, organic vs incentivized liquidity, CL fee tier refinement, metapool TVL dedup, and data quality filters

## Problem Statement

Pharos v1 DEX liquidity scoring captures pool TVL, volume, and basic mechanism classification, but misses critical health signals:

1. **Pool balance ratios** are computed but never surfaced — a stablecoin pool at 80/20 looks identical to 50/50
2. **Pairing asset identity** is embedded in symbol strings but not scored — USDC paired with USDT (safe) scores the same as USDC paired with a random governance token (fragile)
3. **Organic vs incentivized liquidity** is indistinguishable — $100M TVL from fee revenue looks identical to $100M TVL from reward farming
4. **CL pools are penalized** instead of credited for capital efficiency (0.7x multiplier vs V2 pools)
5. **Curve CryptoSwap pools** are treated as StableSwap (wrong A-factor semantics)
6. **Metapool TVL is double-counted** — base pool liquidity attributed fully to each metapool
7. **Broken/dead/rugged protocol pools** inflate TVL counts

## Architecture Decision

**Approach: Incremental Enhancement** of the existing `syncDexLiquidity()` function. All data for these improvements already exists in the API responses we currently fetch — we just need to stop discarding it. Zero additional API calls required.

## 1. Enhanced Data Capture

### 1.1 DeFiLlama Yields — New Fields

Add to `LlamaPool` interface:

| Field | Type | Purpose |
|-------|------|---------|
| `apyBase` | `number \| null` | Organic fee APY for durability scoring |
| `apyReward` | `number \| null` | Incentive APY for durability scoring |
| `sigma` | `number` | APY volatility — pool stability signal |
| `exposure` | `string` | `"single"` (lending) vs `"multi"` (DEX LP) |
| `count` | `number` | Data point count — pool age proxy |

**New filter:** Skip pools where `exposure === "single"` — these are lending deposits (Aave, Compound), not DEX liquidity.

### 1.2 Curve API — New Fields

Add to `CurvePool` interface:

| Field | Type | Purpose |
|-------|------|---------|
| `registryId` | `string` | StableSwap vs CryptoSwap classification |
| `isBroken` | `boolean` | Exclude deprecated pools |
| `virtualPrice` | `string` | LP health signal |
| `usdTotalExcludingBasePool` | `number` | Accurate metapool TVL |
| `creationTs` | `number` | Pool age |
| `gaugeCrvApy` | `[number, number] \| null` | CRV incentive level |
| `coins[].address` | `string` | Contract-address-based matching |

**New filters:**
- Skip `isBroken === true`
- Use `registryId` to distinguish StableSwap from CryptoSwap

### 1.3 DeFiLlama Protocols — New Fields

Add `deadFrom`, `rugged`, `deprecated` to protocol scan. Exclude matching protocols from `dexProjects` set.

## 2. Enhanced Pool Quality Scoring

### 2.1 Pool Mechanism Multiplier (v2)

| Pool Type | v1 | v2 | Detection |
|-----------|----|----|-----------|
| Curve StableSwap A>=500 | 1.0 | 1.0 | `registryId` NOT containing `crypto` + A>=500 |
| Curve StableSwap A<500 | 0.8 | 0.85 | `registryId` NOT containing `crypto` + A<500 |
| Curve CryptoSwap | (treated as StableSwap) | 0.5 | `registryId` containing `crypto` or `twocrypto` or `tricrypto` |
| Uni V3 1bp | 0.85 | 1.1 | fee tier <= 100 |
| Uni V3 5bp | 0.7 | 0.85 | fee tier <= 500 |
| Uni V3 30bp+ | 0.4 | 0.4 | fee tier > 500 |
| Fluid | 0.85 | 0.85 | unchanged |
| Balancer Stable | 0.85 | 0.85 | unchanged |
| Balancer Weighted | 0.3 | 0.4 | project contains `balancer`, pool doesn't match stable pattern |
| Generic AMM | 0.3 | 0.3 | fallback |

### 2.2 Balance Health Score (Continuous)

Replaces the binary `balanceRatio < 0.3 → 50% haircut`:

```
balanceHealthScore = balanceRatio ^ 1.5

ratio 1.0 → 1.0    (perfectly balanced)
ratio 0.8 → 0.72   (modest discount)
ratio 0.5 → 0.35   (significant stress)
ratio 0.3 → 0.16   (severe imbalance)
ratio 0.1 → 0.03   (nearly drained)
```

Applied to Curve pools (where balance data exists). Non-Curve pools: `balanceHealthScore = 1.0`.

### 2.3 Pairing Asset Quality Score

For each pool, score each co-token from the perspective of the stablecoin being evaluated:

```typescript
function getPairQuality(symbol: string): number {
  const meta = symbolToMeta[symbol.toUpperCase()];
  if (meta) {
    if (meta.governance === 'centralized') return 1.0;
    if (meta.governance === 'decentralized') return 0.9;
    if (meta.governance === 'centralized-dependent') return 0.8;
    return 0.7;
  }
  return VOLATILE_PAIR_QUALITY[symbol.toUpperCase()] ?? 0.3;
}

const VOLATILE_PAIR_QUALITY: Record<string, number> = {
  'WETH': 0.65, 'ETH': 0.65, 'STETH': 0.65, 'WSTETH': 0.65,
  'WBTC': 0.6, 'TBTC': 0.55, 'CBBTC': 0.6,
  // Everything else: 0.3
};
```

Multi-asset pools: use the **best** co-token quality (one good exit route suffices).

### 2.4 MetaPool TVL Adjustment

When Curve pool has `basePoolAddress !== null`:
- Use `usdTotalExcludingBasePool` for TVL attribution
- Prevents double-counting across ~322 metapools

### 2.5 Combined Pool Quality

```
poolQuality = mechanismMultiplier × balanceHealthScore × pairQualityScore
qualityAdjustedTvl = sum(pool.tvl × poolQuality) across all pools
```

## 3. Durability Component + Rebalanced Composite Score

### 3.1 Liquidity Durability Score (0-100)

```
durabilityScore = 0.40 × organicFractionScore
               + 0.25 × tvlStabilityScore
               + 0.20 × volumeConsistencyScore
               + 0.15 × maturityScore
```

**Organic Fraction (40%):**
Per pool: `apyBase / max(apy, 0.01)`. TVL-weighted average across pools.
Scale: `min(100, organicFraction × 125)`. 0.80+ organic → 100, pure farm → 0.
Null `apyBase` → assume 0.5 (neutral).

**TVL Stability (25%):**
Reuse existing `depth_stability` (CV of 30-day TVL, inverted). Scale: `stability × 100`.

**Volume Consistency (20%):**
CV of 30-day daily volume from `dex_liquidity_history`, inverted: `max(0, min(100, (1 - volumeCV) * 100))`.
Requires >=7 days of data.

**Maturity (15%):**
Oldest pool age across all pools for this stablecoin.
Curve: `creationTs`. DeFiLlama: `count` as proxy (~1 count/day).
Scale: `min(100, ageDays / 365 * 100)`.

### 3.2 Rebalanced Composite Score (6 Components)

| Component | v1 Weight | v2 Weight |
|-----------|-----------|-----------|
| TVL Depth | 35% | 30% |
| Volume Activity | 25% | 20% |
| Pool Quality | 20% | 20% |
| **Durability** | — | **15%** |
| Pair Diversity | 10% | 7.5% |
| Cross-chain | 10% | 7.5% |

TVL Depth now uses `effectiveTvl` (adjusted for metapool, balance, CL) instead of raw TVL.

### 3.3 Data Quality Filters (Pre-Scoring Gates)

| Filter | Source | Action |
|--------|--------|--------|
| `isBroken === true` | Curve API | Skip pool |
| `deadFrom` / `rugged` / `deprecated` | DeFiLlama Protocols | Remove from `dexProjects` |
| `exposure === "single"` | DeFiLlama Yields | Skip pool (lending, not DEX) |
| `registryId` contains `crypto` | Curve API | Reclassify as CryptoSwap |

## 4. Enhanced Per-Pool Data & Pool Stress Index

### 4.1 Enriched PoolEntry

New fields in `extra`:

```typescript
extra?: {
  // Existing
  amplificationCoefficient?: number;
  balanceRatio?: number;
  feeTier?: number;

  // New
  effectiveTvl?: number;
  organicFraction?: number;
  pairQuality?: number;
  stressIndex?: number;
  isMetaPool?: boolean;
  maturityDays?: number;
  balanceDetails?: {
    symbol: string;
    balancePct: number;
    isTracked: boolean;
  }[];
};
```

### 4.2 Pool Stress Index (0-100, higher = more stressed)

```
stressIndex = max(0, min(100,
  35 × (1 - balanceRatio)
+ 25 × (1 - organicFraction)
+ 20 × immaturityPenalty
+ 20 × (1 - pairQuality)
))
```

Where `immaturityPenalty = max(0, 1 - maturityDays / 365)`.

### 4.3 New D1 Columns

```sql
ALTER TABLE dex_liquidity ADD COLUMN avg_pool_stress REAL;
ALTER TABLE dex_liquidity ADD COLUMN weighted_balance_ratio REAL;
ALTER TABLE dex_liquidity ADD COLUMN organic_fraction REAL;
ALTER TABLE dex_liquidity ADD COLUMN effective_tvl_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE dex_liquidity ADD COLUMN durability_score INTEGER;
ALTER TABLE dex_liquidity ADD COLUMN score_components_json TEXT;
```

## 5. API & Frontend Changes

### 5.1 API Response Enhancement (`/api/dex-liquidity`)

New fields per entry:

```typescript
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
```

Top pools entries gain enriched `extra` fields (balance details, effective TVL, stress index, organic fraction, pair quality).

### 5.2 Frontend: Detail Page Card Enhancements

1. **Score Component Breakdown** — 6 horizontal bars showing each component score
2. **Pool Balance Column** in top pools table — colored bar (green/amber/red)
3. **Balance Detail Tooltip** — per-token percentage on hover
4. **Pool Stress Dot** — green/amber/red per pool
5. **Organic Badge** — "Organic" / "Mixed" / "Farmed" per pool
6. **Effective TVL vs Raw TVL** — both numbers with adjustment explanation
7. **Durability Badge** — "Durable" / "Moderate" / "Fragile"
8. **Aggregate Balance Health** — weighted average with colored indicator

### 5.3 Frontend: Leaderboard Page Enhancements

New columns: Eff. TVL, Balance, Organic, Durability, Stress (all hidden on small screens).
New summary stat: "Avg Pool Health" and "Organic Liquidity" cards.
New sort options for all new columns.

## 6. Migration Strategy

Single migration file `0012_dex_liquidity_v2.sql` with 6 `ALTER TABLE ADD COLUMN` statements.

No data migration needed — new columns populate on next cron run. Old data continues to work (new columns are nullable or have defaults).

The `top_pools_json` schema change is backwards-compatible — extra fields in JSON are ignored by old code, and the frontend reads whatever fields exist.

## Non-Goals

- **Tick-level CL data** — would require subgraph queries per pool; too expensive for now
- **Virtual price time-series** — useful for alerting but requires new table and Curve-specific storage; deferred
- **Real-time balance monitoring** — would require direct RPC calls; out of scope
- **Per-pool historical tracking** — individual pool TVL history requires a new table; deferred to v3
