import { createMethodologyVersion } from "./methodology-version";

/**
 * Clear oracle dependency risk methodology version.
 *
 * Tracks the dependency-blending weights, sentinel scores, weak-dep penalty,
 * and wrapper/mechanism ceilings implemented in clear-oracle-risk-scoring.ts.
 * Bump this whenever any of those constants or the algorithm change.
 */
export const CLEAR_ORACLE_RISK_VERSION = createMethodologyVersion({
  currentVersion: "1.0",
  changelogPath: "/methodology/clear-oracle-risk",
  changelog: [
    {
      version: "1.0",
      title: "Initial Clear oracle dependency risk monitor",
      date: "2026-04-07",
      effectiveAt: Date.UTC(2026, 3, 7) / 1000,
      summary:
        "Dependency-only risk scoring for the 6 Clear oracle stables " +
        "(USDT, USDC, GHO, USDe, USDS, pyUSD). Pure config; no live data.",
      impact: [
        "Per-stablecoin upstream dependency map (collateral / mechanism / wrapper / custody)",
        "Self-backed governance baseline blended with weighted upstream scores",
        "Weak-dep penalty + wrapper/mechanism ceilings adapted from Pharos",
        "Card surfaces on detail page only for the 6 configured Clear oracle stables",
      ],
      commits: [],
      reconstructed: false,
    },
  ],
});
