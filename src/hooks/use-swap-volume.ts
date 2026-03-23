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

async function fetchSwapVolume(days: number): Promise<SwapVolumeData> {
  const resp = await fetch(`${API_BASE}/api/swap-volume?days=${days}`);
  if (!resp.ok) throw new Error(`swap-volume API error: ${resp.status}`);
  return resp.json();
}

export function useSwapVolume(days: number = 7) {
  return useQuery({
    queryKey: ["clear-swap-volume", days],
    queryFn: () => fetchSwapVolume(days),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
