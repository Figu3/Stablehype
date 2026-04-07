import { createMethodologyVersion } from "./methodology-version";

/**
 * Depeg detection methodology version.
 *
 * Tracks the live depeg detection threshold and DEX cross-validation gating
 * implemented in worker/src/cron/sync-stablecoins/detect-depegs.ts.
 */
export const DEPEG_DETECTION_VERSION = createMethodologyVersion({
  currentVersion: "1.1",
  changelogPath: "/methodology/depeg-detection",
  changelog: [
    {
      version: "1.1",
      title: "Lower live threshold to 3 bps",
      date: "2026-04-07",
      effectiveAt: Date.UTC(2026, 3, 7) / 1000,
      summary:
        "Live depeg detection threshold dropped from 5 bps to 3 bps to surface tighter peg stress events.",
      impact: [
        "More events surfaced for high-quality stablecoins (USDC/USDT/DAI) that previously stayed within the 5 bps band",
        "DEX cross-validation gating extended to suppress false positives at the lower threshold",
      ],
      commits: ["e7fbd8e"],
      reconstructed: false,
    },
    {
      version: "1.0",
      title: "Initial live depeg detection",
      date: "2026-02-15",
      effectiveAt: Date.UTC(2026, 1, 15) / 1000,
      summary:
        "Single-pass detector with 5 bps threshold and DEX cross-validation gate.",
      impact: ["Live event opening, peak tracking, direction-change handling, and recovery closing"],
      commits: [],
      reconstructed: true,
    },
  ],
});
