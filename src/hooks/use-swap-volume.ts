"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { SwapSource } from "@shared/lib/clear-classification";

export type { SwapSource };

export interface DailySwapVolume {
  date: string;
  volumeUSD: number;
  swapCount: number;
}

export interface DailySwapVolumeBySource {
  date: string;
  sources: Record<SwapSource, { volumeUSD: number; swapCount: number }>;
}

export interface SwapVolumeData {
  volumeUSD: number;
  swapCount: number;
  daily: DailySwapVolume[];
}

export interface SwapVolumeBySourceData {
  volumeUSD: number;
  swapCount: number;
  daily: DailySwapVolumeBySource[];
}

async function fetchSwapVolume(days: number, token: string | null): Promise<SwapVolumeData> {
  const params = new URLSearchParams({ days: String(days) });
  if (token) params.set("token", token);
  const resp = await fetch(`${API_BASE}/api/swap-volume?${params}`);
  if (!resp.ok) throw new Error(`swap-volume API error: ${resp.status}`);
  return resp.json();
}

async function fetchSwapVolumeBySource(days: number, token: string | null): Promise<SwapVolumeBySourceData> {
  const params = new URLSearchParams({ days: String(days), breakdown: "source" });
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

export function useSwapVolumeBySource(days: number = 7, token: string | null = null) {
  return useQuery({
    queryKey: ["clear-swap-volume-by-source", days, token],
    queryFn: () => fetchSwapVolumeBySource(days, token),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
