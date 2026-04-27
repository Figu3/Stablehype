"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface DailyTvl {
  date: string;
  totalAssetsUSD: number;
}

export interface ClearTvlHistoryData {
  daily: DailyTvl[];
}

async function fetchClearTvlHistory(days: number): Promise<ClearTvlHistoryData> {
  const resp = await fetch(`${API_BASE}/api/clear-tvl-history?days=${days}`);
  if (!resp.ok) throw new Error(`clear-tvl-history API error: ${resp.status}`);
  return resp.json();
}

export function useClearTvlHistory(days: number) {
  return useQuery({
    queryKey: ["clear-tvl-history", days],
    queryFn: () => fetchClearTvlHistory(days),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
