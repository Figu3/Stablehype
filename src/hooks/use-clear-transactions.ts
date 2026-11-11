"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import { V1_TOKENS, v1ActorTag, v1SwapOrigin, type ActorTag, type SwapOrigin } from "@shared/lib/clear-v1-config";
import type { ClearV1Event } from "@/hooks/use-clear-v1";

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

export type ClearTransaction = (ClearSwap | ClearRebalance) & {
  v1?: boolean;
  tag?: ActorTag | null;
  /** V1 swaps only: KyberSwap, Direct, another router's name, or Other. */
  origin?: SwapOrigin | null;
};

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

/**
 * V1 swaps and rebalances as terminal rows. A swap routed through a Meta reserve logs one
 * event per reserve, so rows are deduped per tx. Amounts are at par, in tokenOut units.
 */
export function toV1Transactions(
  events: ClearV1Event[],
  tokens: Record<string, { symbol: string }> = V1_TOKENS,
): ClearTransaction[] {
  const seen = new Set<string>();
  return events.flatMap<ClearTransaction>((e) => {
    const key = `${e.tx_hash}-${e.kind}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const token = (address: string | null) => ({
      address: address ?? "",
      symbol: address ? (tokens[address.toLowerCase()]?.symbol ?? V1_TOKENS[address.toLowerCase()]?.symbol ?? null) : null,
    });
    const base = {
      v1: true,
      tag: v1ActorTag(e.actor, e.tx_from, e.tx_to),
      txHash: e.tx_hash,
      blockNumber: e.block_number,
      timestamp: e.timestamp,
      date: new Date(e.timestamp * 1000).toISOString().slice(0, 10),
      tokenIn: token(e.token_in),
      tokenOut: token(e.token_out),
      amountInUsd: e.volume_units ?? 0,
      amountOutUsd: e.volume_units ?? 0,
    };
    return e.kind === "swap"
      ? [{ ...base, type: "swap" as const, origin: v1SwapOrigin(e), receiver: e.actor ?? "", fees: { treasuryFeeIou: null, lpFeeIou: null } }]
      : [{ ...base, type: "rebalance" as const }];
  });
}
