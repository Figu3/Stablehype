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
  feeds: { asset: string; symbol: string; lastUpdate: number | null; ttl: number | null; price: number | null }[];
  wallets: { address: string; label: string; balanceEth: number | null }[];
}

export interface ClearV1Period {
  days: number;
  swapVolume: number;
  reserveLegVolume: number;
  poolVolume: number;
  swapCount: number;
  rebalanceCount: number;
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
  reserveVolume7d: { address: string; volume: number }[];
  poolVolume7d: { address: string; volume: number }[];
  entryPoints: { entry: string; swaps: number; volume: number }[];
  daily: { date: string; swapVolume: number; revenue: number }[];
  dailyTvl: { date: string; grossTvl: number | null; netTvl: number | null }[];
  unknownReserves: string[];
  updatedAt: number | null;
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

export const useClearV1Activity = (kind: string | null) =>
  useQuery({
    queryKey: ["clear-v1-activity", kind],
    queryFn: () => get<{ events: ClearV1Event[] }>(`/api/clear-v1-activity?limit=50${kind ? `&kind=${kind}` : ""}`),
    ...POLL,
  });
