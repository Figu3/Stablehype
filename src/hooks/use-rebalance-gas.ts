"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface CategoryMetrics {
  totalETH: number;
  totalUSD: number;
  totalTxs: number;
  avgPerTx: number;   // USD, ingest-priced
  daily: number;      // USD spent in last 24h
  weekly: number;     // avg USD/day over last 7d
  monthly: number;    // avg USD/day over last 30d

  // Runway inputs — ETH-denominated. Use these (not USD fields) for any
  // calculation that divides by the current keeper balance, so spot ETH/USD
  // moves don't skew the number.
  dailyETH: number;
  weeklyETH: number;
  monthlyETH: number;
  txsLast7d: number;
  txsLast30d: number;
  txPerHour7d: number;
  avgCostETH7d: number;
  p95CostETH30d: number;
  maxCostETH30d: number;
}

export interface DailyBucket {
  date: string;
  total_eth: number;
  total_usd: number;
  count: number;
}

export interface KeeperGasData {
  oracle: CategoryMetrics;
  rebalance: CategoryMetrics;
  oracleDaily: DailyBucket[];
  rebalanceDaily: DailyBucket[];
  combined: {
    totalETH: number;
    totalUSD: number;
    dailyBurnETH: number;
    dailyBurnUSD: number;
    ethPriceUsd: number;
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
