import { V1_BASE_RESERVE, V1_TOKENS } from "@shared/lib/clear-v1-config";

export interface MetricEvent {
  tx_hash: string;
  date: string;
  contract: string;
  kind: string;
  token_in: string | null;
  token_out: string | null;
  amount_in_raw: string | null;
  amount_out_raw: string | null;
  volume_token: string | null;
  volume_units: number | null;
  fee_token: string | null;
  fee_treasury_units: number | null;
  fee_lp_units: number | null;
  fee_trader_units: number | null;
}

/** date -> bLP redemption price. All figures are at par: stablecoins count $1. */
export type BlpPrices = Map<string, number>;

export function priceOn(token: string | null, date: string, prices: BlpPrices): number {
  if (token !== V1_BASE_RESERVE) return 1;
  const exact = prices.get(date);
  if (exact !== undefined) return exact;
  const dates = [...prices.keys()].sort();
  if (dates.length === 0) return 1;
  const before = dates.filter((d) => d <= date).pop();
  return prices.get(before ?? dates[0])!;
}

export interface TvlLeg {
  kind: "base" | "meta";
  grossPar: number | null;
  nativeValue: number | null;
  iouDebtPar: number | null;
}

/** Base gross plus Meta native legs. Meta gross is excluded: it includes bLP already counted in Base. */
export function computeTvl(legs: TvlLeg[]) {
  const held = legs.map((l) => (l.kind === "base" ? l.grossPar : l.nativeValue));
  const debts = legs.map((l) => l.iouDebtPar);
  if (held.some((v) => v === null) || debts.some((v) => v === null)) {
    return { grossTvl: null, iouDebt: null, netTvl: null, partial: true };
  }
  const grossTvl = (held as number[]).reduce((a, b) => a + b, 0);
  const iouDebt = (debts as number[]).reduce((a, b) => a + b, 0);
  return { grossTvl, iouDebt, netTvl: grossTvl - iouDebt, partial: false };
}

export function computeVolume(swaps: MetricEvent[], prices: BlpPrices) {
  const perTx = new Map<string, number>();
  let reserveLegVolume = 0;
  for (const s of swaps) {
    const usd = (s.volume_units ?? 0) * priceOn(s.volume_token, s.date, prices);
    reserveLegVolume += usd;
    perTx.set(s.tx_hash, Math.max(perTx.get(s.tx_hash) ?? 0, usd));
  }
  return { swapVolume: [...perTx.values()].reduce((a, b) => a + b, 0), reserveLegVolume };
}

const rawUnits = (raw: string | null, token: string | null): number => {
  const decimals = token ? V1_TOKENS[token]?.decimals : undefined;
  return raw && decimals !== undefined ? Number(raw) / 10 ** decimals : 0;
};

export function computeRevenue(events: MetricEvent[], prices: BlpPrices) {
  const r = { swapTreasury: 0, swapLp: 0, traderRebate: 0, singleAssetTreasury: 0, flashLp: 0, rebalanceResult: 0 };
  for (const e of events) {
    const p = priceOn(e.fee_token, e.date, prices);
    if (e.kind === "swap") {
      r.swapTreasury += (e.fee_treasury_units ?? 0) * p;
      r.swapLp += (e.fee_lp_units ?? 0) * p;
      r.traderRebate += (e.fee_trader_units ?? 0) * p;
    } else if (e.kind === "flash_loan") {
      r.flashLp += (e.fee_lp_units ?? 0) * p;
    } else if (e.kind === "deposit" || e.kind === "withdraw") {
      r.singleAssetTreasury += (e.fee_treasury_units ?? 0) * p;
    } else if (e.kind === "rebalance" && e.contract === V1_BASE_RESERVE) {
      // Meta rebalances are NAV-neutral on redemption basis, so only Base moves par NAV.
      r.rebalanceResult += rawUnits(e.amount_in_raw, e.token_in) - rawUnits(e.amount_out_raw, e.token_out);
    }
  }
  // The trader rebate is paid out, so it is not revenue.
  return { ...r, total: r.swapTreasury + r.swapLp + r.singleAssetTreasury + r.flashLp };
}

const MIN_APR_DAYS = 3;
const YEAR_DAYS = 365;

/**
 * LP fees over a run of daily net values, as a simple annual rate in percent. Null under three
 * days of history or with no capital: one day annualised is noise, not a rate.
 */
export function computeLpApr(lpFees: number, dailyNet: number[]): number | null {
  if (dailyNet.length < MIN_APR_DAYS) return null;
  const average = dailyNet.reduce((a, b) => a + b, 0) / dailyNet.length;
  if (average <= 0) return null;
  return (lpFees / average) * (YEAR_DAYS / dailyNet.length) * 100;
}

const DAY_MS = 86_400_000;

/**
 * Share price growth between the first and last point, as a simple annual rate in percent:
 * everything an LP earned (fees, deposit and withdrawal pricing, rebalances), net of losses.
 * Points are daily snapshots in date order. Null under three days of span or an unpriced start.
 */
export function computeNavApr(points: { date: string; nav: number }[]) {
  const first = points[0];
  const last = points[points.length - 1];
  const days = first && last ? Math.round((Date.parse(last.date) - Date.parse(first.date)) / DAY_MS) : 0;
  const apr = first && last && days >= MIN_APR_DAYS && first.nav > 0
    ? (last.nav / first.nav - 1) * (YEAR_DAYS / days) * 100
    : null;
  return { navStart: first?.nav ?? null, navEnd: last?.nav ?? null, days, apr };
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

const MIN_RUNWAY_DAYS = 3;

export function computeRunway(balanceEth: number, dailyEth: number, daysOfData: number): number | null {
  if (daysOfData < MIN_RUNWAY_DAYS || dailyEth <= 0) return null;
  return balanceEth / dailyEth;
}

const HOUR_SECONDS = 3600;
const BURN_SHORT_HOURS = 24;
const BURN_LONG_HOURS = 168;

// ETH per hour for alerting: the higher of the 24h and 7 day rates. The keeper is bursty,
// so the 24h rate catches a spike, and it gets stopped on purpose, so the 7 day rate keeps
// a quiet day from reading as an endless runway. A wallet younger than 7 days is measured
// over its real age, at least 24h so that one fresh tx is not a huge rate.
export function computeBurnPerHour(txs: { ts: number; eth: number }[], nowSec: number): number {
  if (txs.length === 0) return 0;
  const spentSince = (hours: number) =>
    txs.filter((t) => t.ts >= nowSec - hours * HOUR_SECONDS).reduce((a, t) => a + t.eth, 0);
  const ageHours = (nowSec - Math.min(...txs.map((t) => t.ts))) / HOUR_SECONDS;
  const longHours = Math.min(BURN_LONG_HOURS, Math.max(BURN_SHORT_HOURS, ageHours));
  return Math.max(spentSince(BURN_SHORT_HOURS) / BURN_SHORT_HOURS, spentSince(BURN_LONG_HOURS) / longHours);
}
