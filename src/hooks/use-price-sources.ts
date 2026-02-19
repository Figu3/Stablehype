"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { PriceSourcesResponse } from "@/lib/types";

async function fetchPriceSources(stablecoinId: string): Promise<PriceSourcesResponse> {
  const res = await fetch(`${API_BASE}/api/price-sources?stablecoin=${encodeURIComponent(stablecoinId)}`);
  if (!res.ok) throw new Error("Failed to fetch price sources");
  return res.json();
}

export function usePriceSources(stablecoinId: string | undefined) {
  return useQuery({
    queryKey: ["price-sources", stablecoinId],
    queryFn: () => fetchPriceSources(stablecoinId!),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
    enabled: !!stablecoinId,
  });
}
