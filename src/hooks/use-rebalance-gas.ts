"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface CategoryMetrics {
  totalETH: number;
  totalUSD: number;
  totalTxs: number;
  avgPerTx: number;
  daily: number;   // USD spent in last 24h
  weekly: number;  // avg USD/day over last 7d
  monthly: number; // avg USD/day over last 30d
}

export interface KeeperGasData {
  oracle: CategoryMetrics;
  rebalance: CategoryMetrics;
  combined: {
    totalETH: number;
    totalUSD: number;
    dailyBurnETH: number;
    dailyBurnUSD: number;
  };
}

async function fetchKeeperGas(): Promise<KeeperGasData> {
  const resp = await fetch(`${API_BASE}/api/keeper-gas`);
  if (!resp.ok) throw new Error(`keeper-gas: ${resp.status}`);
  return resp.json();
}

export function useKeeperGasFromD1() {
  return useQuery({
    queryKey: ["keeper-gas-d1"],
    queryFn: fetchKeeperGas,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
