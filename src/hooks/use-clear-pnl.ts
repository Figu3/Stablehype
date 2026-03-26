"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface PeriodPnL {
  days: number;
  swapFeesUSD: number;
  passiveFeesUSD: number | null;
  totalFeesUSD: number;
  lpRevenueUSD: number;
  netRevenueUSD: number;
  swapCount: number;
  rebalanceCount: number;
}

export interface ClearPnLData {
  periods: PeriodPnL[];
}

async function fetchClearPnL(): Promise<ClearPnLData> {
  const resp = await fetch(`${API_BASE}/api/clear-pnl`);
  if (!resp.ok) throw new Error(`clear-pnl API error: ${resp.status}`);
  return resp.json();
}

export function useClearPnL() {
  return useQuery({
    queryKey: ["clear-pnl"],
    queryFn: fetchClearPnL,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
