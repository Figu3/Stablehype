/**
 * Internal Stablecoin Tiering Framework v0.3 (Feb 2026)
 *
 * Based on the StableHype scoring model with 8 dimensions.
 * Maps DefiLlama stablecoin IDs to tiers T1–T5.
 *
 * T1 Core       — Metapool-eligible, highest safety
 * T2 Standard   — Paired pool eligible
 * T3 Risky      — High risk, close monitoring
 * T4 Experimental — Watchlist, limited exposure
 * T5 Blacklist  — Excluded from protocol
 */

export type TierLevel = "T1" | "T2" | "T3" | "T4" | "T5";

export interface TierMeta {
  level: TierLevel;
  label: string;
  description: string;
  dotClass: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export const TIER_META: Record<TierLevel, TierMeta> = {
  T1: {
    level: "T1",
    label: "Core",
    description: "Metapool-eligible, highest safety and liquidity",
    dotClass: "bg-emerald-500",
    bgClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    textClass: "text-emerald-600 dark:text-emerald-400",
    borderClass: "border-emerald-500",
  },
  T2: {
    level: "T2",
    label: "Standard",
    description: "Paired pool eligible, solid fundamentals",
    dotClass: "bg-blue-500",
    bgClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    textClass: "text-blue-600 dark:text-blue-400",
    borderClass: "border-blue-500",
  },
  T3: {
    level: "T3",
    label: "Risky",
    description: "High risk profile, requires close monitoring",
    dotClass: "bg-amber-500",
    bgClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    textClass: "text-amber-600 dark:text-amber-400",
    borderClass: "border-amber-500",
  },
  T4: {
    level: "T4",
    label: "Experimental",
    description: "Watchlist only, limited or no protocol exposure",
    dotClass: "bg-orange-500",
    bgClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    textClass: "text-orange-600 dark:text-orange-400",
    borderClass: "border-orange-500",
  },
  T5: {
    level: "T5",
    label: "Blacklist",
    description: "Excluded from protocol integration",
    dotClass: "bg-red-500",
    bgClass: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    textClass: "text-red-600 dark:text-red-400",
    borderClass: "border-red-500",
  },
};

/** Numeric ordering for sorting (higher = safer) */
export const TIER_ORDER: Record<TierLevel, number> = {
  T1: 5,
  T2: 4,
  T3: 3,
  T4: 2,
  T5: 1,
};

/**
 * 8-dimension scoring model.
 * Each dimension scored 0–3:
 *   3 = exceeds expectations
 *   2 = meets expectations
 *   1 = below expectations
 *   0 = hard fail → automatic T5
 */
export interface TierScoreDimension {
  label: string;
  shortLabel: string;
  score: number; // 0–3
  weight: number; // percentage weight for the tier
}

export interface TierAssignment {
  tier: TierLevel;
  score: number | null; // weighted composite score (null if auto-T5)
  dimensions: TierScoreDimension[];
  overrideReason?: string; // if tier was manually overridden
}

/**
 * Stablecoin → Tier mapping.
 * Key: DefiLlama stablecoin ID (string)
 *
 * Current classifications as of February 2026.
 */
export const STABLECOIN_TIERS: Record<string, TierLevel> = {
  // ── T1 Core (~$257B) ──────────────────────────────────
  "2": "T1",   // USDC
  "1": "T1",   // USDT

  // ── T2 Standard (~$11.8B) ─────────────────────────────
  "118": "T2", // GHO
  "72": "T2",  // USDS (formerly MakerDAO DSR)
  "5": "T2",   // DAI

  // ── T3 Risky (~$13.4B) ────────────────────────────────
  "146": "T3", // USDe
  "95": "T3",  // PYUSD
  "178": "T3", // USDf (Staked Frax)
  "124": "T3", // USD0
  "198": "T3", // USDai
  "89": "T3",  // crvUSD
  "200": "T3", // USDA (Angle)

  // ── T4 Experimental (~$8.3B) ──────────────────────────
  "208": "T4", // USD1
  "175": "T4", // RLUSD
  "196": "T4", // USDG
  "188": "T4", // USDtb
  "153": "T4", // wUSDM
  "184": "T4", // M (M^0)
  "187": "T4", // USR

  // ── T5 Blacklist (~$5.4B) ─────────────────────────────
  "173": "T5", // BUIDL
  "170": "T5", // USYC
  "163": "T5", // USDY
  "10": "T5",  // USDD
  "4": "T5",   // TUSD
  "194": "T5", // YLDS
  "7": "T5",   // FDUSD
  // deUSD (Elixir/Stream Finance) removed — collapsed Nov 2025
};

/**
 * Detailed scoring for stablecoins that have full 8-dimension analysis.
 * Key: DefiLlama stablecoin ID.
 */
export const STABLECOIN_TIER_SCORES: Record<string, TierAssignment> = {
  // T1: USDC
  "2": {
    tier: "T1",
    score: 2.80,
    dimensions: [
      { label: "Backing Soundness", shortLabel: "Backing", score: 3, weight: 25 },
      { label: "Redemption Reliability", shortLabel: "Redeem", score: 3, weight: 25 },
      { label: "Depeg History", shortLabel: "Depeg", score: 2, weight: 20 },
      { label: "Liquidity Depth (DEX)", shortLabel: "Liq.", score: 3, weight: 15 },
      { label: "Market Cap", shortLabel: "MCap", score: 3, weight: 5 },
      { label: "Protocol Maturity", shortLabel: "Mature", score: 3, weight: 5 },
      { label: "Revenue Potential", shortLabel: "Rev.", score: 3, weight: 0 },
      { label: "IOU Resolution Confidence", shortLabel: "IOU", score: 3, weight: 5 },
    ],
  },
  // T1: USDT
  "1": {
    tier: "T1",
    score: 2.75,
    dimensions: [
      { label: "Backing Soundness", shortLabel: "Backing", score: 3, weight: 25 },
      { label: "Redemption Reliability", shortLabel: "Redeem", score: 3, weight: 25 },
      { label: "Depeg History", shortLabel: "Depeg", score: 2, weight: 20 },
      { label: "Liquidity Depth (DEX)", shortLabel: "Liq.", score: 3, weight: 15 },
      { label: "Market Cap", shortLabel: "MCap", score: 3, weight: 5 },
      { label: "Protocol Maturity", shortLabel: "Mature", score: 3, weight: 5 },
      { label: "Revenue Potential", shortLabel: "Rev.", score: 3, weight: 0 },
      { label: "IOU Resolution Confidence", shortLabel: "IOU", score: 2, weight: 5 },
    ],
  },
  // T2: GHO
  "118": {
    tier: "T2",
    score: 2.60,
    dimensions: [
      { label: "Backing Soundness", shortLabel: "Backing", score: 3, weight: 20 },
      { label: "Redemption Reliability", shortLabel: "Redeem", score: 2, weight: 20 },
      { label: "Depeg History", shortLabel: "Depeg", score: 2, weight: 15 },
      { label: "Liquidity Depth (DEX)", shortLabel: "Liq.", score: 3, weight: 15 },
      { label: "Market Cap", shortLabel: "MCap", score: 2, weight: 5 },
      { label: "Protocol Maturity", shortLabel: "Mature", score: 3, weight: 10 },
      { label: "Revenue Potential", shortLabel: "Rev.", score: 3, weight: 10 },
      { label: "IOU Resolution Confidence", shortLabel: "IOU", score: 3, weight: 5 },
    ],
  },
  // T2: USDS
  "72": {
    tier: "T2",
    score: 2.70,
    dimensions: [
      { label: "Backing Soundness", shortLabel: "Backing", score: 3, weight: 20 },
      { label: "Redemption Reliability", shortLabel: "Redeem", score: 3, weight: 20 },
      { label: "Depeg History", shortLabel: "Depeg", score: 2, weight: 15 },
      { label: "Liquidity Depth (DEX)", shortLabel: "Liq.", score: 2, weight: 15 },
      { label: "Market Cap", shortLabel: "MCap", score: 3, weight: 5 },
      { label: "Protocol Maturity", shortLabel: "Mature", score: 3, weight: 10 },
      { label: "Revenue Potential", shortLabel: "Rev.", score: 3, weight: 10 },
      { label: "IOU Resolution Confidence", shortLabel: "IOU", score: 3, weight: 5 },
    ],
  },
  // T2: DAI
  "5": {
    tier: "T2",
    score: 2.50,
    dimensions: [
      { label: "Backing Soundness", shortLabel: "Backing", score: 3, weight: 20 },
      { label: "Redemption Reliability", shortLabel: "Redeem", score: 2, weight: 20 },
      { label: "Depeg History", shortLabel: "Depeg", score: 2, weight: 15 },
      { label: "Liquidity Depth (DEX)", shortLabel: "Liq.", score: 3, weight: 15 },
      { label: "Market Cap", shortLabel: "MCap", score: 3, weight: 5 },
      { label: "Protocol Maturity", shortLabel: "Mature", score: 3, weight: 10 },
      { label: "Revenue Potential", shortLabel: "Rev.", score: 2, weight: 10 },
      { label: "IOU Resolution Confidence", shortLabel: "IOU", score: 2, weight: 5 },
    ],
  },
  // T3: USDe
  "146": {
    tier: "T3",
    score: 2.10,
    dimensions: [
      { label: "Backing Soundness", shortLabel: "Backing", score: 2, weight: 20 },
      { label: "Redemption Reliability", shortLabel: "Redeem", score: 2, weight: 20 },
      { label: "Depeg History", shortLabel: "Depeg", score: 2, weight: 15 },
      { label: "Liquidity Depth (DEX)", shortLabel: "Liq.", score: 2, weight: 15 },
      { label: "Market Cap", shortLabel: "MCap", score: 3, weight: 5 },
      { label: "Protocol Maturity", shortLabel: "Mature", score: 2, weight: 10 },
      { label: "Revenue Potential", shortLabel: "Rev.", score: 3, weight: 10 },
      { label: "IOU Resolution Confidence", shortLabel: "IOU", score: 1, weight: 5 },
    ],
  },
};

/**
 * Get the tier for a stablecoin by DefiLlama ID.
 * Returns undefined if not classified.
 */
export function getStablecoinTier(stablecoinId: string): TierLevel | undefined {
  return STABLECOIN_TIERS[stablecoinId];
}

/**
 * Get full tier assignment with scoring details.
 * Returns undefined if no detailed scoring exists.
 */
export function getStablecoinTierScore(stablecoinId: string): TierAssignment | undefined {
  return STABLECOIN_TIER_SCORES[stablecoinId];
}
