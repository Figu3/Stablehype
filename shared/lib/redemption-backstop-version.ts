import { createMethodologyVersion } from "./methodology-version";

/**
 * Redemption backstop methodology version.
 *
 * Tracks the scoring weights, breakpoints, and route-family caps implemented
 * in `redemption-backstop-scoring.ts`. Bump this whenever any of those change.
 */
export const REDEMPTION_BACKSTOP_VERSION = createMethodologyVersion({
  currentVersion: "1.0",
  changelogPath: "/methodology/redemption-backstops",
  changelog: [
    {
      version: "1.0",
      title: "Initial port from Pharos",
      date: "2026-04-07",
      effectiveAt: Date.UTC(2026, 3, 7) / 1000,
      summary:
        "Static-only redemption backstop scoring ported from Pharos. " +
        "6-component weighted score with route-family caps. No live capacity yet.",
      impact: [
        "Per-stablecoin redemption route classification (PSM, queue, issuer, collateral)",
        "Composite 0–100 score capped per route family",
        "Card surfaces on stablecoin detail page when a config is present",
      ],
      commits: [],
      reconstructed: false,
    },
  ],
});
