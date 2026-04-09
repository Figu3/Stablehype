import { createMethodologyVersion } from "./methodology-version";

export const CSI_VERSION = createMethodologyVersion({
  currentVersion: "1.0",
  changelogPath: "/methodology/clear-stability-index",
  changelog: [
    {
      version: "1.0",
      title: "Initial Clear Stability Index",
      date: "2026-04-09",
      effectiveAt: Date.UTC(2026, 3, 9) / 1000,
      summary:
        "Composite stability score for the 6 Clear oracle stables " +
        "(USDT, USDC, GHO, USDe, USDS, pyUSD). Weighted blend of peg " +
        "stability (25%), dependency risk (20%), DEX liquidity (20%), " +
        "redemption backstop (20%), and bluechip rating (15%).",
      impact: [
        "Single headline score (0-100) per Clear oracle stablecoin",
        "Missing components are excluded and weight redistributed",
        "Minimum 3 of 5 components required to produce a score",
        "Card surfaces on detail page for the 6 configured coins",
      ],
      commits: [],
      reconstructed: false,
    },
  ],
});
