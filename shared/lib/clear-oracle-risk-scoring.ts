// Pure scoring functions for the Clear oracle dependency risk monitor.
//
// Adapted from Pharos's report-card-dependency.ts but typed against our smaller
// ClearOracleRiskConfig instead of StablecoinMeta. No reserves slicing, no
// reserve-template derivation — the dependency list is hand-curated upstream.

import type {
  ClearOracleResolvedDep,
  ClearOracleRiskConfig,
  ClearOracleRiskEntry,
} from "./clear-oracle-risk-types";

const SELF_BACKED_SCORE_BY_GOVERNANCE: Record<ClearOracleRiskConfig["governance"], number> = {
  decentralized: 90,
  "centralized-dependent": 75,
  centralized: 95,
};

const GOVERNANCE_DETAIL_LABEL: Record<ClearOracleRiskConfig["governance"], string> = {
  decentralized: "Decentralized",
  "centralized-dependent": "Partially centralized",
  centralized: "Centralized",
};

/** Sentinel scores for upstream ids that are not configured stablecoins. */
const SENTINEL_SCORES: Record<string, number> = {
  "offchain-issuer": 70,
  "fiat-banks": 60,
  "cex-custody": 55,
};

const WRAPPER_PENALTY = 3;
const WEAK_DEP_THRESHOLD = 75;
const WEAK_DEP_PENALTY = 10;
const FALLBACK_NO_RESOLVED_SCORE = 70;

/** A→F grade ladder copied from Pharos's report-card-core.ts. */
export function scoreToGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C-";
  if (score >= 50) return "D+";
  if (score >= 45) return "D";
  if (score >= 40) return "D-";
  return "F";
}

/**
 * Compute the dependency-risk score for one Clear oracle stablecoin.
 *
 * @param config              The hand-curated config for this stablecoin.
 * @param upstreamScoresById  Scores for the configured stablecoins (used to
 *                            blend internal-id deps). Sentinel ids fall back
 *                            to SENTINEL_SCORES.
 */
export function scoreClearOracleDependencyRisk(
  config: ClearOracleRiskConfig,
  upstreamScoresById: ReadonlyMap<string, number>,
): ClearOracleRiskEntry {
  const selfBackedScore = SELF_BACKED_SCORE_BY_GOVERNANCE[config.governance];
  const governanceLabel = GOVERNANCE_DETAIL_LABEL[config.governance];

  if (config.dependencies.length === 0) {
    const score = selfBackedScore;
    return {
      id: config.id,
      score,
      grade: scoreToGrade(score),
      detail: `Self-backed: ${governanceLabel} (${selfBackedScore})`,
      selfBackedScore,
      resolvedDeps: [],
    };
  }

  const resolved: ClearOracleResolvedDep[] = [];
  for (const dep of config.dependencies) {
    const upstreamScore =
      upstreamScoresById.get(dep.upstreamId) ?? SENTINEL_SCORES[dep.upstreamId];
    if (upstreamScore === undefined) continue;
    resolved.push({
      upstreamId: dep.upstreamId,
      label: dep.label,
      weight: dep.weight,
      type: dep.type,
      score: upstreamScore,
      note: dep.note,
    });
  }

  if (resolved.length === 0) {
    const score = FALLBACK_NO_RESOLVED_SCORE;
    return {
      id: config.id,
      score,
      grade: scoreToGrade(score),
      detail: "Upstream dependency scores unavailable",
      selfBackedScore,
      resolvedDeps: [],
    };
  }

  const rawTotal = resolved.reduce((sum, dep) => sum + dep.weight, 0);
  const totalWeight = Math.min(1, rawTotal);
  const selfBackedFraction = 1 - totalWeight;
  const normalizer = rawTotal > 1 ? rawTotal : 1;

  const blendedScore =
    resolved.reduce((sum, dep) => sum + dep.score * (dep.weight / normalizer), 0) +
    selfBackedFraction * selfBackedScore;

  let score = blendedScore;

  const weakDeps = resolved.filter((dep) => dep.score < WEAK_DEP_THRESHOLD);
  if (weakDeps.length > 0) {
    score -= WEAK_DEP_PENALTY;
  }

  let ceiling = Infinity;
  let ceilingType: "wrapper" | "mechanism" | null = null;
  for (const dep of resolved) {
    if (dep.type === "wrapper") {
      const cap = dep.score - WRAPPER_PENALTY;
      if (cap < ceiling) {
        ceiling = cap;
        ceilingType = "wrapper";
      }
    } else if (dep.type === "mechanism") {
      if (dep.score < ceiling) {
        ceiling = dep.score;
        if (ceilingType !== "wrapper") ceilingType = "mechanism";
      }
    }
  }
  if (ceiling < Infinity) {
    score = Math.min(score, ceiling);
  }

  score = Math.round(Math.max(0, Math.min(100, score)));

  const parts: string[] = [];
  parts.push(
    `Upstream: ${resolved.length} upstream dep${resolved.length === 1 ? "" : "s"} (${Math.round(
      totalWeight * 100,
    )}% weight) (${Math.round(blendedScore)})`,
  );
  parts.push(`Self-backed: ${governanceLabel} (${selfBackedScore})`);
  if (weakDeps.length > 0) {
    parts.push(
      `Penalty: ${weakDeps.length} weak dep${weakDeps.length === 1 ? "" : "s"} below ${WEAK_DEP_THRESHOLD} (-${WEAK_DEP_PENALTY})`,
    );
  }
  if (ceiling < Infinity && ceilingType) {
    parts.push(`Ceiling: ${ceilingType} dependency ceiling (${Math.round(ceiling)})`);
  }

  return {
    id: config.id,
    score,
    grade: scoreToGrade(score),
    detail: parts.join(". "),
    selfBackedScore,
    resolvedDeps: resolved,
  };
}

/**
 * Score every config in the registry, bootstrapping internal-id deps via two
 * passes: first the configs whose deps are pure sentinels, then the rest using
 * the first-pass scores as `upstreamScoresById`.
 */
export function scoreAllClearOracleConfigs(
  configs: Readonly<Record<string, ClearOracleRiskConfig>>,
): Record<string, ClearOracleRiskEntry> {
  const empty = new Map<string, number>();
  const internalIds = new Set(Object.keys(configs));

  function depsAreAllSentinels(config: ClearOracleRiskConfig): boolean {
    return config.dependencies.every((dep) => !internalIds.has(dep.upstreamId));
  }

  // Pass 1: configs whose deps reference only sentinels (no internal coin ids).
  const firstPass: Record<string, ClearOracleRiskEntry> = {};
  const upstreamScores = new Map<string, number>();
  for (const [id, config] of Object.entries(configs)) {
    if (depsAreAllSentinels(config)) {
      const entry = scoreClearOracleDependencyRisk(config, empty);
      firstPass[id] = entry;
      upstreamScores.set(id, entry.score);
    }
  }

  // Pass 2: configs that reference at least one internal id.
  const result: Record<string, ClearOracleRiskEntry> = { ...firstPass };
  for (const [id, config] of Object.entries(configs)) {
    if (!depsAreAllSentinels(config)) {
      result[id] = scoreClearOracleDependencyRisk(config, upstreamScores);
    }
  }

  return result;
}
