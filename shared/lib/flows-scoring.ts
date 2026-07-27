/**
 * Supply flow (mint/burn) pressure scoring.
 *
 * All figures derive from DefiLlama circulating snapshots already in the
 * stablecoins cache (current / prev-day / prev-week / prev-month) — no new
 * external data source.
 *
 * Pressure score: how unusual today's net flow is versus the coin's own
 * 30-day baseline, normalized by supply. 0 = matches baseline, negative =
 * redemption pressure worse than normal, positive = issuance above normal.
 * An excess flow of ±4% of supply per day saturates the score at ±100.
 */

/** Multiplier converting excess daily flow (% of supply) into score points. */
export const FLOW_PRESSURE_SCALE = 25;

/** Coins below this supply are excluded from pressure scoring (noise). */
export const FLOW_MIN_SUPPLY_USD = 1_000_000;

/** Gauge thresholds: below -10 = redemption stress, above +10 = issuance strength. */
export const GAUGE_STRESS_THRESHOLD = -10;
export const GAUGE_STRENGTH_THRESHOLD = 10;

export type GaugeBand = "redemption-stress" | "neutral" | "issuance-strength";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Score today's net flow against the coin's 30-day average daily flow.
 * Returns null when supply is too small or inputs are not finite.
 */
export function computePressureScore(
  flow24hUsd: number,
  baselineDailyUsd: number,
  supplyUsd: number,
): number | null {
  if (!Number.isFinite(flow24hUsd) || !Number.isFinite(baselineDailyUsd) || !Number.isFinite(supplyUsd)) return null;
  if (supplyUsd < FLOW_MIN_SUPPLY_USD) return null;
  const excessPct = ((flow24hUsd - baselineDailyUsd) / supplyUsd) * 100;
  return clamp(Math.round(excessPct * FLOW_PRESSURE_SCALE), -100, 100);
}

/**
 * Market-cap-weighted mean of per-coin pressure scores (-100..+100).
 * Returns null when no coin qualifies.
 */
export function computeGauge(
  entries: { pressureScore: number | null; supplyUsd: number }[],
): number | null {
  let weighted = 0;
  let totalWeight = 0;
  for (const e of entries) {
    if (e.pressureScore == null || e.supplyUsd <= 0) continue;
    weighted += e.pressureScore * e.supplyUsd;
    totalWeight += e.supplyUsd;
  }
  if (totalWeight === 0) return null;
  return Math.round(weighted / totalWeight);
}

export function gaugeBand(gauge: number): GaugeBand {
  if (gauge < GAUGE_STRESS_THRESHOLD) return "redemption-stress";
  if (gauge > GAUGE_STRENGTH_THRESHOLD) return "issuance-strength";
  return "neutral";
}
