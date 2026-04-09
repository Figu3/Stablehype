/**
 * Clear Stability Index (CSI) types.
 *
 * A composite 0-100 score for the 6 Clear oracle stablecoins combining:
 *   - Peg stability (25%)
 *   - Dependency risk (20%)
 *   - DEX liquidity (20%)
 *   - Redemption backstop (20%)
 *   - Bluechip rating (15%)
 */

export interface CsiComponentScores {
  pegScore: number | null;
  dependencyRiskScore: number | null;
  dexLiquidityScore: number | null;
  redemptionBackstopScore: number | null;
  bluechipScore: number | null;
}

export interface CsiEntry {
  stablecoinId: string;
  /** Composite 0-100 score, or null if too many components are missing */
  score: number | null;
  /** Letter grade derived from composite score */
  grade: string;
  /** Individual component scores */
  components: CsiComponentScores;
  /** Components that were missing and excluded from the weighted average */
  missingComponents: string[];
}

export interface CsiMethodology {
  version: string;
  effectiveAt: string;
  weights: CsiWeights;
}

export interface CsiWeights {
  pegScore: number;
  dependencyRisk: number;
  dexLiquidity: number;
  redemptionBackstop: number;
  bluechip: number;
}

export interface CsiResponse {
  coins: Record<string, CsiEntry>;
  methodology: CsiMethodology;
  updatedAt: number;
}
