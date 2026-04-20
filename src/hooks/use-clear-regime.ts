"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface RegimeToken {
  symbol: string;
  address: string;
  aboveCount: number;
  belowCount: number;
  avgAboveBps: number;
  avgBelowBps: number;
  netRegimeBps: number;
  activeDirection: "above" | "below" | null;
}

export interface RegimeFlowRoute {
  from: string;
  to: string;
  volumeUSD: number;
  swapCount: number;
  spreadUSD: number;
  sharePct: number;
}

export interface RegimeVaultBalance {
  symbol: string;
  usd: number;
  pct: number;
}

export interface RegimeAllocation {
  symbol: string;
  pct: number;
  usdAtReference: number;
  driftPctPoints: number | null;
  rationale: string;
}

export interface ClearRegimeData {
  windowDays: number;
  tokens: RegimeToken[];
  flow: {
    totalVolumeUSD: number;
    totalSwaps: number;
    routes: RegimeFlowRoute[];
  };
  vault: {
    totalUSD: number;
    balances: RegimeVaultBalance[];
  };
  suggested: {
    referenceTVL: number;
    allocations: RegimeAllocation[];
    narrative: string;
  };
}

async function fetchClearRegime(): Promise<ClearRegimeData> {
  const resp = await fetch(`${API_BASE}/api/clear-regime`);
  if (!resp.ok) throw new Error(`clear-regime API error: ${resp.status}`);
  return resp.json();
}

export function useClearRegime() {
  return useQuery({
    queryKey: ["clear-regime"],
    queryFn: fetchClearRegime,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
