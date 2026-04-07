"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { ClearOracleRiskResponse } from "@shared/lib/clear-oracle-risk-types";

async function fetchClearOracleRisk(): Promise<ClearOracleRiskResponse | null> {
  const res = await fetch(`${API_BASE}/api/clear-oracle-risk`);
  if (!res.ok) {
    if (res.status === 503) return null;
    throw new Error("Failed to fetch clear oracle risk");
  }
  return res.json();
}

export function useClearOracleRisk() {
  return useQuery({
    queryKey: ["clear-oracle-risk"],
    queryFn: fetchClearOracleRisk,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
