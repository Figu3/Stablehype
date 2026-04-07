import { createMethodologyVersion } from "./methodology-version";

/**
 * DEX liquidity score methodology version.
 *
 * Tracks the 6-component composite liquidity score implemented in
 * worker/src/cron/sync-dex-liquidity.ts.
 */
export const DEX_LIQUIDITY_VERSION = createMethodologyVersion({
  currentVersion: "2.0",
  changelogPath: "/methodology/dex-liquidity",
  changelog: [
    {
      version: "2.0",
      title: "Quality-adjusted effective TVL with metapool dedup",
      date: "2026-03-15",
      effectiveAt: Date.UTC(2026, 2, 15) / 1000,
      summary:
        "Pool-quality multipliers (mechanism × balance health × pair quality), metapool TVL deduplication, durability score, and concentration HHI.",
      impact: [
        "TVL no longer naively summed across pools — quality multipliers and metapool dedup prevent overstating effective depth",
        "Durability score adds organic-fee fraction, TVL/volume stability, and pool maturity into the composite",
      ],
      commits: [],
      reconstructed: true,
    },
    {
      version: "1.0",
      title: "Initial 6-component liquidity score",
      date: "2026-02-15",
      effectiveAt: Date.UTC(2026, 1, 15) / 1000,
      summary:
        "TVL depth (30%), volume activity (20%), pool quality (20%), durability (15%), pair diversity (7.5%), cross-chain (7.5%).",
      impact: ["Liquidity leaderboard and detail page DEX liquidity card surface this score"],
      commits: [],
      reconstructed: true,
    },
  ],
});
