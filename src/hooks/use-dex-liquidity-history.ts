"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { DexLiquidityHistoryPoint } from "@/lib/types";

async function fetchDexLiquidityHistory(
  stablecoinId: string,
  days: number
): Promise<DexLiquidityHistoryPoint[]> {
  const res = await fetch(
    `${API_BASE}/api/dex-liquidity-history?stablecoin=${encodeURIComponent(stablecoinId)}&days=${days}`
  );
  if (!res.ok) throw new Error("Failed to fetch DEX liquidity history");
  return res.json();
}

export function useDexLiquidityHistory(stablecoinId: string, days = 90) {
  return useQuery({
    queryKey: ["dex-liquidity-history", stablecoinId, days],
    queryFn: () => fetchDexLiquidityHistory(stablecoinId, days),
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });
}
