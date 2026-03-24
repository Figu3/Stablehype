"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export type RebalanceType = "internal" | "external";

export interface DailyRebalanceVolume {
  date: string;
  volumeUSD: number;
  rebalanceCount: number;
}

export interface DailyRebalanceVolumeByType {
  date: string;
  types: Record<RebalanceType, { volumeUSD: number; rebalanceCount: number }>;
}

export interface RebalanceVolumeData {
  volumeUSD: number;
  rebalanceCount: number;
  daily: DailyRebalanceVolume[];
}

export interface RebalanceVolumeByTypeData {
  volumeUSD: number;
  rebalanceCount: number;
  daily: DailyRebalanceVolumeByType[];
}

async function fetchRebalanceVolume(days: number, token: string | null): Promise<RebalanceVolumeData> {
  const params = new URLSearchParams({ days: String(days) });
  if (token) params.set("token", token);
  const resp = await fetch(`${API_BASE}/api/rebalance-volume?${params}`);
  if (!resp.ok) throw new Error(`rebalance-volume API error: ${resp.status}`);
  return resp.json();
}

async function fetchRebalanceVolumeByType(days: number, token: string | null): Promise<RebalanceVolumeByTypeData> {
  const params = new URLSearchParams({ days: String(days), breakdown: "type" });
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

export function useRebalanceVolumeByType(days: number = 7, token: string | null = null) {
  return useQuery({
    queryKey: ["clear-rebalance-volume-by-type", days, token],
    queryFn: () => fetchRebalanceVolumeByType(days, token),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
