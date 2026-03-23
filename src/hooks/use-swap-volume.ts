"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface DailySwapVolume {
  date: string; // YYYY-MM-DD
  volumeUSD: number;
  swapCount: number;
}

export interface SwapVolumeData {
  volumeUSD: number;
  swapCount: number;
  daily: DailySwapVolume[];
}

async function fetchSwapVolume(days: number, token: string | null): Promise<SwapVolumeData> {
  const params = new URLSearchParams({ days: String(days) });
  if (token) params.set("token", token);
  const resp = await fetch(`${API_BASE}/api/swap-volume?${params}`);
  if (!resp.ok) throw new Error(`swap-volume API error: ${resp.status}`);
  return resp.json();
}

export function useSwapVolume(days: number = 7, token: string | null = null) {
  return useQuery({
    queryKey: ["clear-swap-volume", days, token],
    queryFn: () => fetchSwapVolume(days, token),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
