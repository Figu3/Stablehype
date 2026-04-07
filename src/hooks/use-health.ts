"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface CacheStatus {
  ageSeconds: number | null;
  maxAge: number;
  healthy: boolean;
}

export interface CronJobHealth {
  lastSuccess: number | null;
  lastFailure: number | null;
  healthy: boolean;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "stale";
  timestamp: number;
  caches: Record<string, CacheStatus>;
  crons: Record<string, CronJobHealth>;
  blacklist: { totalEvents: number; missingAmounts: number };
  botDb?: {
    poolSnapshots: { rowCount: number; latestTs: number | null };
    cexPriceHistory: { rowCount: number; latestTs: number | null };
  };
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error("Failed to fetch health");
  return res.json();
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    staleTime: 60 * 1000, // 1 min
    refetchInterval: 2 * 60 * 1000, // poll every 2 min
    retry: 1,
  });
}
