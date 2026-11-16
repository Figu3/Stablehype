"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface SeveCarry {
  /** What lenders put in. Null when the market holds a deposit or withdrawal the ledger does not know. */
  principal?: number | null;
  /** Debt less principal. Null with the principal: never a guess. */
  interest: number | null;
  earned: number;
  costs: number;
  /** What the market owes its lenders. Absent from an older Worker. */
  debt?: number;
  /** Drawn by Sève: debt less the cash sitting in the market. */
  owed: number;
  net: number | null;
  updatedAt: number;
}

export function useSeveCarry() {
  return useQuery({
    queryKey: ["seve-carry"],
    queryFn: async (): Promise<SeveCarry> => {
      const r = await fetch(`${API_BASE}/api/seve-carry`);
      if (!r.ok) throw new Error(`seve carry: ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export interface SeveRebalanceRow {
  txHash: string;
  timestamp: number;
  reserve: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  /** Null when a leg is a reserve LP token rather than a $1 stablecoin. */
  grossUsd: number | null;
  grossBps: number | null;
  netUsd: number | null;
  netBps: number | null;
}

export interface SeveRebalances {
  /** Issuer redemption cost assumed on the received leg, in bps. Not on-chain. */
  costBps: number;
  count: number;
  pricedCount: number;
  volumeUsd: number;
  grossUsd: number;
  netUsd: number;
  grossBps: number | null;
  netBps: number | null;
  rows: SeveRebalanceRow[];
  tokens: Record<string, { symbol: string; decimals: number }>;
}

export function useSeveRebalances() {
  return useQuery({
    queryKey: ["seve-rebalances"],
    queryFn: async (): Promise<SeveRebalances> => {
      const r = await fetch(`${API_BASE}/api/seve-rebalances`);
      if (!r.ok) throw new Error(`seve rebalances: ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export interface SeveHolding {
  token: string;
  amount: number;
}

export interface SeveCapital {
  /** Stablecoins in the Rebalancer Safe. */
  ready: SeveHolding[];
  readyUsd: number;
  /** Sent to an issuer and not paid back yet. */
  convertingUsd: number;
  /** Stablecoins in the Borrower Safe. */
  idle: SeveHolding[];
  idleUsd: number;
  updatedAt: number;
}

export function useSeveCapital() {
  return useQuery({
    queryKey: ["seve-capital"],
    queryFn: async (): Promise<SeveCapital> => {
      const r = await fetch(`${API_BASE}/api/seve-capital`);
      if (!r.ok) throw new Error(`seve capital: ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export interface SeveConversion {
  timestamp: number;
  txHash: string;
  /** swap: both legs in one transaction, on the market. With the issuer: mint, burn, or convert (neither leg is an issuer token). */
  kind: "swap" | "mint" | "burn" | "convert";
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
}

export interface SeveConversions {
  /** Last 90 days, newest first. */
  conversions: SeveConversion[];
  /** Receipts that matched nothing Sève had sent. */
  unpaired: number;
  tokens: Record<string, { symbol: string; decimals: number }>;
}

export function useSeveConversions() {
  return useQuery({
    queryKey: ["seve-conversions"],
    queryFn: async (): Promise<SeveConversions> => {
      const r = await fetch(`${API_BASE}/api/seve-conversions`);
      if (!r.ok) throw new Error(`seve conversions: ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
