"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface RebalanceGasMetrics {
  totalGasCostETH: number;
  totalGasCostUSD: number;
  totalTransactions: number;
  missingGasCount: number;
}

async function fetchRebalanceGas(): Promise<RebalanceGasMetrics> {
  const resp = await fetch(`${API_BASE}/api/keeper-gas?days=365`);
  if (!resp.ok) throw new Error(`keeper-gas: ${resp.status}`);
  return resp.json();
}

export function useRebalanceGas() {
  return useQuery({
    queryKey: ["rebalance-gas"],
    queryFn: fetchRebalanceGas,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
