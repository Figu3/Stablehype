"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { RedemptionBackstopsResponse } from "@shared/lib/redemption-types";

async function fetchRedemptionBackstops(): Promise<RedemptionBackstopsResponse | null> {
  const res = await fetch(`${API_BASE}/api/redemption-backstops`);
  if (!res.ok) {
    if (res.status === 503) return null;
    throw new Error("Failed to fetch redemption backstops");
  }
  return res.json();
}

export function useRedemptionBackstops() {
  return useQuery({
    queryKey: ["redemption-backstops"],
    queryFn: fetchRedemptionBackstops,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
