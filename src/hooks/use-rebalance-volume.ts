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

async function fetchRebalanceVolume(days: number, token: string | null): Promise<RebalanceVolumeData> {
  const params = new URLSearchParams({ days: String(days) });
  if (token) params.set("token", token);
  const resp = await fetch(`${API_BASE}/api/rebalance-volume?${params}`);
  if (!resp.ok) throw new Error(`rebalance-volume API error: ${resp.status}`);
  return resp.json();
}

export function useRebalanceVolume(days: number = 7, token: string | null = null) {
  return useQuery({
    queryKey: ["clear-rebalance-volume", days, token],
    queryFn: () => fetchRebalanceVolume(days, token),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
