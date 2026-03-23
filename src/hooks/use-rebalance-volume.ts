"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface DailyRebalanceVolume {
  date: string;
  volumeUSD: number;
  rebalanceCount: number;
}

export interface RebalanceVolumeData {
  volumeUSD: number;
  rebalanceCount: number;
  daily: DailyRebalanceVolume[];
}

async function fetchRebalanceVolume(days: number): Promise<RebalanceVolumeData> {
  const resp = await fetch(`${API_BASE}/api/rebalance-volume?days=${days}`);
  if (!resp.ok) throw new Error(`rebalance-volume API error: ${resp.status}`);
  return resp.json();
}

export function useRebalanceVolume(days: number = 7) {
  return useQuery({
    queryKey: ["clear-rebalance-volume", days],
    queryFn: () => fetchRebalanceVolume(days),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
