/**
 * Stablehype Market Index (SMI) — a single 0-100 health score for the whole
 * tracked stablecoin market, computed from four signals already in D1:
 *
 *  - Deviation severity: supply-weighted mean absolute peg deviation (bps)
 *  - Depeg breadth: share of tracked coins in an active depeg event
 *  - Stress breadth: share of coins deviating ≥20bps (pre-depeg stress)
 *  - Market-cap trend: 7-day change in total tracked supply
 *
 * Higher = calmer. Bands use a sea-state metaphor (Glassy → Meltdown).
 */

export const MARKET_INDEX_WEIGHTS = {
  deviation: 0.35,
  depegBreadth: 0.25,
  stressBreadth: 0.2,
  mcapTrend: 0.2,
} as const;

/** Coins deviating at least this much (bps) count toward stress breadth. */
export const STRESS_DEVIATION_BPS = 20;

export interface MarketIndexBand {
  min: number;
  key: string;
  label: string;
}

/** Ordered high → low; first band whose min <= score wins. */
export const MARKET_INDEX_BANDS: readonly MarketIndexBand[] = [
  { min: 90, key: "glassy", label: "Glassy" },
  { min: 75, key: "steady", label: "Steady" },
  { min: 60, key: "choppy", label: "Choppy" },
  { min: 40, key: "rough", label: "Rough" },
  { min: 20, key: "stormy", label: "Stormy" },
  { min: 0, key: "meltdown", label: "Meltdown" },
];

export function marketIndexBand(score: number): MarketIndexBand {
  for (const band of MARKET_INDEX_BANDS) {
    if (score >= band.min) return band;
  }
  return MARKET_INDEX_BANDS[MARKET_INDEX_BANDS.length - 1];
}

export interface MarketIndexInputs {
  /** Supply-weighted mean absolute peg deviation across tracked coins, in bps. */
  weightedAbsDeviationBps: number;
  /** Share (0-1) of tracked coins currently in an active depeg event. */
  activeDepegShare: number;
  /** Share (0-1) of tracked coins deviating >= STRESS_DEVIATION_BPS. */
  stressShare: number;
  /** 7-day percent change in total tracked market cap (e.g. 1.2 = +1.2%). Null if history unavailable. */
  mcapTrend7dPct: number | null;
}

export interface MarketIndexComponents {
  deviationScore: number;
  depegBreadthScore: number;
  stressBreadthScore: number;
  mcapTrendScore: number | null;
}

export interface MarketIndexResult {
  score: number;
  bandKey: string;
  bandLabel: string;
  components: MarketIndexComponents;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function computeMarketIndex(inputs: MarketIndexInputs): MarketIndexResult {
  // 0bps weighted deviation → 100; 50bps → 0
  const deviationScore = clamp(Math.round(100 - inputs.weightedAbsDeviationBps * 2), 0, 100);
  // 25% of coins in active depeg → 0
  const depegBreadthScore = clamp(Math.round(100 - inputs.activeDepegShare * 400), 0, 100);
  // 40% of coins stressed → 0
  const stressBreadthScore = clamp(Math.round(100 - inputs.stressShare * 250), 0, 100);
  // ±5% weekly market-cap move maps to 100/0; flat = 50
  const mcapTrendScore = inputs.mcapTrend7dPct == null
    ? null
    : clamp(Math.round(50 + inputs.mcapTrend7dPct * 10), 0, 100);

  const w = MARKET_INDEX_WEIGHTS;
  let score: number;
  if (mcapTrendScore == null) {
    // Redistribute the trend weight across the three peg signals
    const total = w.deviation + w.depegBreadth + w.stressBreadth;
    score =
      (deviationScore * w.deviation + depegBreadthScore * w.depegBreadth + stressBreadthScore * w.stressBreadth) /
      total;
  } else {
    score =
      deviationScore * w.deviation +
      depegBreadthScore * w.depegBreadth +
      stressBreadthScore * w.stressBreadth +
      mcapTrendScore * w.mcapTrend;
  }

  const rounded = clamp(Math.round(score), 0, 100);
  const band = marketIndexBand(rounded);
  return {
    score: rounded,
    bandKey: band.key,
    bandLabel: band.label,
    components: { deviationScore, depegBreadthScore, stressBreadthScore, mcapTrendScore },
  };
}
