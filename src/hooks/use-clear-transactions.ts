"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface ClearSwap {
  type: "swap";
  txHash: string;
  blockNumber: number;
  timestamp: number;
  date: string;
  tokenIn: { address: string; symbol: string | null };
  tokenOut: { address: string; symbol: string | null };
  receiver: string;
  amountInUsd: number;
  amountOutUsd: number;
  fees: {
    treasuryFeeIou: string | null;
    lpFeeIou: string | null;
  };
}

export interface ClearRebalance {
  type: "rebalance";
  txHash: string;
  blockNumber: number;
  timestamp: number;
  date: string;
  tokenIn: { address: string; symbol: string | null };
  tokenOut: { address: string; symbol: string | null };
  amountInUsd: number;
  amountOutUsd: number;
}

export type ClearTransaction = ClearSwap | ClearRebalance;

export type TxTypeFilter = "all" | "swap" | "rebalance";

interface TransactionsResponse {
  swaps?: ClearSwap[];
  rebalances?: ClearRebalance[];
  meta: { days: number; cutoff: string; limit: number; offset: number };
}

interface UseTransactionsOptions {
  type?: TxTypeFilter;
  days?: number;
  token?: string | null;
  limit?: number;
}

async function fetchTransactions(opts: UseTransactionsOptions): Promise<ClearTransaction[]> {
  const params = new URLSearchParams();
  params.set("type", opts.type ?? "all");
  params.set("days", String(opts.days ?? 90));
  params.set("limit", String(opts.limit ?? 500));
  if (opts.token) params.set("token", opts.token);

  const resp = await fetch(`${API_BASE}/api/clear-transactions?${params}`);
  if (!resp.ok) throw new Error(`clear-transactions API error: ${resp.status}`);
  const data: TransactionsResponse = await resp.json();

  // Merge and sort by timestamp desc
  const all: ClearTransaction[] = [
    ...(data.swaps ?? []),
    ...(data.rebalances ?? []),
  ];
  all.sort((a, b) => b.timestamp - a.timestamp);
  return all;
}

export function useClearTransactions(opts: UseTransactionsOptions = {}) {
  return useQuery({
    queryKey: ["clear-transactions", opts.type ?? "all", opts.days ?? 90, opts.token ?? null, opts.limit ?? 500],
    queryFn: () => fetchTransactions(opts),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
