import { createMethodologyVersion } from "./methodology-version";

export const MARKET_INDEX_VERSION = createMethodologyVersion({
  currentVersion: "1.0",
  changelogPath: "/methodology/market-index",
  changelog: [
    {
      version: "1.0",
      title: "Initial Stablehype Market Index",
      date: "2026-07-27",
      effectiveAt: Date.UTC(2026, 6, 27) / 1000,
      summary:
        "Market-wide 0-100 health score blending supply-weighted peg deviation " +
        "(35%), active depeg breadth (25%), pre-depeg stress breadth (20%), and " +
        "7-day market-cap trend (20%). Six sea-state bands from Glassy (90+) to " +
        "Meltdown (<20). Daily history stored for charting.",
      impact: [
        "Single headline number for overall stablecoin market health",
        "Homepage hero card with band label and component breakdown",
        "Daily snapshots recorded in market_index_history",
        "Missing trend data redistributes weight to peg signals",
      ],
      commits: [],
      reconstructed: false,
    },
  ],
});
