/**
 * Clear Stability Index (CSI) scoring.
 *
 * Computes a weighted composite 0-100 score from 5 sub-scores. When a
 * component is null (data unavailable), its weight is redistributed
 * proportionally among the available components.
 *
 * Minimum 3 of 5 components must be present to produce a score; otherwise
 * the composite is null.
 */

import type {
  CsiComponentScores,
  CsiEntry,
  CsiWeights,
} from "./csi-types";

export const CSI_WEIGHTS: CsiWeights = {
  pegScore: 0.25,
  dependencyRisk: 0.20,
  dexLiquidity: 0.20,
  redemptionBackstop: 0.20,
  bluechip: 0.15,
};

/** Minimum number of non-null components required to produce a score. */
const MIN_COMPONENTS = 3;

const WEIGHT_KEYS: { key: keyof CsiComponentScores; weightKey: keyof CsiWeights }[] = [
  { key: "pegScore", weightKey: "pegScore" },
  { key: "dependencyRiskScore", weightKey: "dependencyRisk" },
  { key: "dexLiquidityScore", weightKey: "dexLiquidity" },
  { key: "redemptionBackstopScore", weightKey: "redemptionBackstop" },
  { key: "bluechipScore", weightKey: "bluechip" },
];

export function scoreToGrade(score: number | null): string {
  if (score == null) return "—";
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "A-";
  if (score >= 65) return "B+";
  if (score >= 60) return "B";
  if (score >= 55) return "B-";
  if (score >= 50) return "C+";
  if (score >= 45) return "C";
  if (score >= 40) return "C-";
  if (score >= 30) return "D";
  return "F";
}

export function computeCsi(
  stablecoinId: string,
  components: CsiComponentScores,
): CsiEntry {
  const missing: string[] = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const { key, weightKey } of WEIGHT_KEYS) {
    const value = components[key];
    if (value == null) {
      missing.push(key);
      continue;
    }
    const w = CSI_WEIGHTS[weightKey];
    totalWeight += w;
    weightedSum += value * w;
  }

  const availableCount = WEIGHT_KEYS.length - missing.length;
  const score = availableCount >= MIN_COMPONENTS && totalWeight > 0
    ? Math.round(weightedSum / totalWeight)
    : null;

  return {
    stablecoinId,
    score,
    grade: scoreToGrade(score),
    components,
    missingComponents: missing,
  };
}
