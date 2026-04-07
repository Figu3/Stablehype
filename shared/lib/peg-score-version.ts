import { createMethodologyVersion } from "./methodology-version";

/**
 * Peg score methodology version.
 *
 * Tracks the composite peg score formula in shared/lib/peg-score.ts.
 */
export const PEG_SCORE_VERSION = createMethodologyVersion({
  currentVersion: "1.0",
  changelogPath: "/methodology/peg-score",
  changelog: [
    {
      version: "1.0",
      title: "Initial composite peg score",
      date: "2026-02-15",
      effectiveAt: Date.UTC(2026, 1, 15) / 1000,
      summary:
        "0–100 score combining peg adherence percentage, severity penalty (per-event bps² weighting), and active depeg penalty.",
      impact: [
        "Detail page hero, peg-summary endpoint, and peg leaderboard sort all use this score",
      ],
      commits: [],
      reconstructed: true,
    },
  ],
});
