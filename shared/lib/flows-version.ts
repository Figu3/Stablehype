import { createMethodologyVersion } from "./methodology-version";

export const FLOWS_VERSION = createMethodologyVersion({
  currentVersion: "1.0",
  changelogPath: "/methodology/supply-flows",
  changelog: [
    {
      version: "1.0",
      title: "Initial supply flows & bank-run gauge",
      date: "2026-07-27",
      effectiveAt: Date.UTC(2026, 6, 27) / 1000,
      summary:
        "Per-coin net mint/burn flows over 24h/7d/30d derived from DefiLlama " +
        "circulating snapshots. Pressure score compares today's net flow to the " +
        "coin's own 30-day baseline, normalized by supply (±4%/day excess " +
        "saturates at ±100). Bank-run gauge is the market-cap-weighted mean of " +
        "pressure scores: below -10 = redemption stress, above +10 = issuance strength.",
      impact: [
        "New /flows page ranking coins by 24h net flow",
        "Bank-run gauge (-100..+100) summarizing market-wide issuance pressure",
        "No new external data source — reuses the stablecoins cache",
        "Coins under $1M supply excluded from pressure scoring",
      ],
      commits: [],
      reconstructed: false,
    },
  ],
});
