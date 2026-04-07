// Types for the Clear oracle dependency risk monitor (P1.6 — slim 6-lite).
//
// A pure-config, dependency-only risk score for the 6 stablecoins consumed by
// the Clear oracle (USDT, USDC, GHO, USDe, USDS, pyUSD). No live data, no D1.

export type ClearOracleDepType = "collateral" | "mechanism" | "wrapper" | "custody";

/** Sentinel upstream ids used when the dep is not one of our 6 internal coins. */
export type ClearOracleSentinelId = "offchain-issuer" | "fiat-banks" | "cex-custody";

export interface ClearOracleDep {
  /** Either a CoinGecko numeric id from the 6 configured coins, or a sentinel. */
  upstreamId: string;
  /** Human-readable label, e.g. "USDC (PSM collateral)". */
  label: string;
  /** Exposure weight in [0, 1]. Sum across deps should be <= 1. */
  weight: number;
  type: ClearOracleDepType;
  note?: string;
}

export interface ClearOracleRiskConfig {
  /** CoinGecko numeric id; must be one of the 6 supported. */
  id: string;
  governance: "centralized" | "centralized-dependent" | "decentralized";
  dependencies: readonly ClearOracleDep[];
  notes?: string;
}

export interface ClearOracleResolvedDep {
  upstreamId: string;
  label: string;
  weight: number;
  type: ClearOracleDepType;
  /** Score used for blending (either the upstream coin's score or a sentinel score). */
  score: number;
  note?: string;
}

export interface ClearOracleRiskEntry {
  id: string;
  /** Composite dependency-risk score, integer in [0, 100]. */
  score: number;
  grade: string;
  /** Multi-clause explanation joined with ". ". */
  detail: string;
  /** Self-backed contribution score, derived purely from governance. */
  selfBackedScore: number;
  resolvedDeps: readonly ClearOracleResolvedDep[];
}

export interface ClearOracleRiskMethodology {
  version: string;
  effectiveAt: string;
}

export interface ClearOracleRiskResponse {
  coins: Record<string, ClearOracleRiskEntry>;
  methodology: ClearOracleRiskMethodology;
  updatedAt: number;
}
