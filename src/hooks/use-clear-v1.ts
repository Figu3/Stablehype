"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

// Field for field from worker/src/api/clear-v1.ts and V1State. Null means the
// oracle (or an RPC sub-call) was unavailable: never render it as zero.

export interface ClearV1Reserve {
  address: string;
  label: string;
  kind: "base" | "meta";
  grossPar: number | null;
  netPar: number | null;
  iouDebtPar: number | null;
  nativeValue: number | null;
  baseLpValue: number | null;
  supply: number | null;
  paused: boolean | null;
  rebalanceNeeded: boolean | null;
  params: Record<string, number | null>;
}

export interface ClearV1State {
  updatedAt: number;
  blpRedemptionPrice: number | null;
  reserves: ClearV1Reserve[];
  pools: { address: string; label: string; coins: string[]; balances: (number | null)[]; adminBalances: (number | null)[] }[];
  feeds: {
    asset: string; symbol: string; lastUpdate: number | null; ttl: number | null; price: number | null;
    /** Absent on a state row written before it was read. */
    redemptionPrice?: number | null;
  }[];
  wallets: { address: string; label: string; balanceEth: number | null }[];
  /** isRouteOpen per reserve and direction. Absent on a state row written before routes existed. */
  routes?: { reserve: string; tokenIn: string; tokenOut: string; open: boolean | null }[];
  /** Stablecoin-to-stablecoin routes. Absent on a state row written before they existed. */
  spotRoutes?: ClearV1SpotRoute[];
  /** Every spot route quoted at a fixed size (amountIn) by chaining the reserves' previews. */
  quotes?: ClearV1Quote[] | null;
  /** Base basket average against redemption, plus the gate limit. The gate itself checks each Base asset, not this average. */
  basket?: { price: number; redemptionPrice: number; offBps: number; proximityBps: number | null } | null;
}

export interface ClearV1Quote {
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  /** What the trader receives; null when any step reverts. */
  amountOut: number | null;
  /** depeg: every swap step on its depeg route. redemption: a step paid at redemption price. */
  pricing: "depeg" | "redemption" | null;
  hops: { reserve: string; via: "swap" | "deposit" | "withdraw"; amountOut: number | null; depeg: boolean | null; error: string | null }[];
}

export interface ClearV1SpotRoute {
  tokenIn: string;
  tokenOut: string;
  open: boolean | null;
  hops: { reserve: string; tokenIn: string; tokenOut: string; via: "swap" | "deposit" | "withdraw"; open: boolean | null }[];
}

export interface ClearV1Period {
  days: number;
  swapVolume: number;
  reserveLegVolume: number;
  poolVolume: number;
  swapCount: number;
  rebalanceCount: number;
  /** Absent from a Worker deployed before it existed. */
  rebalanceVolume?: number;
  /** The window before this one; null when indexed history does not cover it whole. */
  previous?: { swapVolume: number; revenue: number; rebalanceVolume: number } | null;
  revenue: {
    swapTreasury: number;
    swapLp: number;
    traderRebate: number;
    singleAssetTreasury: number;
    flashLp: number;
    rebalanceResult: number;
    total: number;
  };
}

export interface ClearV1Overview {
  state: ClearV1State | null;
  tvl: { grossTvl: number | null; iouDebt: number | null; netTvl: number | null; partial: boolean };
  curveAdminPending: number | null;
  periods: ClearV1Period[];
  /** Everything indexed; `days` is the span since the first event. Absent from an older Worker. */
  allTime?: ClearV1Period;
  reserveVolume7d: { address: string; volume: number }[];
  /** LP fees against average net value, annualised. apr is null under three days of snapshots. Absent from an older Worker. */
  reserveLpApr7d?: { address: string; lpFees: number; days: number; apr: number | null }[];
  poolVolume7d: { address: string; volume: number }[];
  entryPoints: { entry: string; swaps: number; volume: number }[];
  /** Rebalance fields are absent from a Worker deployed before they existed. */
  daily: {
    date: string; swapVolume: number; revenue: number; rebalanceVolume?: number; rebalanceCount?: number;
    /** What swappers paid, by recipient. Absent from a Worker deployed before it existed. */
    swapFees?: { lp: number; treasury: number; trader: number };
  }[];
  dailyTvl: { date: string; grossTvl: number | null; netTvl: number | null }[];
  unknownReserves: string[];
  /** Static seed plus tokens of discovered reserves, keyed by lowercase address. */
  tokens: Record<string, { symbol: string; decimals: number }>;
  /** What self-discovery adopted on top of the static config. */
  discovery: { reserves: string[]; pools: string[]; backfillJobs: number };
  updatedAt: number | null;
  /** Timestamp of the newest indexed event row. Quiet periods add no rows. */
  eventsUpdatedAt: number | null;
  /** Events cursor block (clear-v1-events). */
  eventsBlock: number;
  /** cron_health.last_success of sync-clear-v1-events, unix seconds. Moves even when no rows arrive. */
  eventsSyncedAt: number | null;
}

export interface ClearV1GasWallet {
  address: string;
  label: string;
  category: "oracle" | "rebalance" | "admin" | "other";
  balanceEth: number | null;
  runwayDays: number | null;
  runwayDaysAtP95Gas: number | null;
  spend: { days: number; eth: number; usd: number; txs: number; failed: number }[];
  daily: { date: string; eth: number; txs: number }[];
}

export interface ClearV1Gas {
  wallets: ClearV1GasWallet[];
  updatedAt: number | null;
}

export interface ClearV1Event {
  tx_hash: string;
  log_index: number;
  block_number: number;
  timestamp: number;
  contract: string;
  kind: string;
  event_name: string;
  actor: string | null;
  tx_from: string | null;
  tx_to: string | null;
  token_in: string | null;
  token_out: string | null;
  volume_token: string | null;
  volume_units: number | null;
}

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`);
  if (!resp.ok) throw new Error(`${path} API error: ${resp.status}`);
  return resp.json();
}

const POLL = { staleTime: 60_000, refetchInterval: 5 * 60_000 };

export const useClearV1Overview = () =>
  useQuery({ queryKey: ["clear-v1-overview"], queryFn: () => get<ClearV1Overview>("/api/clear-v1-overview"), ...POLL });

export const useClearV1Gas = () =>
  useQuery({ queryKey: ["clear-v1-gas"], queryFn: () => get<ClearV1Gas>("/api/clear-v1-gas"), ...POLL });

export const useClearV1Activity = (kind: string | null, opts: { actors?: readonly string[]; limit?: number } = {}) => {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 50) });
  if (kind) params.set("kind", kind);
  if (opts.actors?.length) params.set("actor", opts.actors.join(","));
  return useQuery({
    queryKey: ["clear-v1-activity", params.toString()],
    queryFn: () => get<{ events: ClearV1Event[]; updatedAt: number | null; tokens: Record<string, { symbol: string; decimals: number }> }>(`/api/clear-v1-activity?${params}`),
    ...POLL,
  });
};
