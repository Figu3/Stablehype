"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { BluechipRatingsMap } from "@/lib/types";

async function fetchBluechipRatings(): Promise<BluechipRatingsMap | null> {
  const res = await fetch(`${API_BASE}/api/bluechip-ratings`);
  if (!res.ok) throw new Error("Failed to fetch Bluechip ratings");
  return res.json();
}

export function useBluechipRatings() {
  return useQuery({
    queryKey: ["bluechip-ratings"],
    queryFn: fetchBluechipRatings,
    staleTime: 60 * 60 * 1000,           // 1 hour
    refetchInterval: 2 * 60 * 60 * 1000, // 2 hours
    retry: 1,
  });
}
