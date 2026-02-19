"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { DexLiquidityMap } from "@/lib/types";

async function fetchDexLiquidity(): Promise<DexLiquidityMap> {
  const res = await fetch(`${API_BASE}/api/dex-liquidity`);
  if (!res.ok) throw new Error("Failed to fetch DEX liquidity");
  return res.json();
}

export function useDexLiquidity() {
  return useQuery({
    queryKey: ["dex-liquidity"],
    queryFn: fetchDexLiquidity,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
  });
}
