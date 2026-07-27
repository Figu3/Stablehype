"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { MarketIndexComponents, MarketIndexInputs } from "@shared/lib/market-index-scoring";

export interface MarketIndexResponse {
  index: {
    score: number;
    bandKey: string;
    bandLabel: string;
    components: MarketIndexComponents;
    inputs: MarketIndexInputs;
    coinsConsidered: number;
    activeDepegCount: number;
    stressedCount: number;
    totalMcapUsd: number;
  };
  history: { date: string; score: number; band: string }[];
  methodology: { version: string; weights: Record<string, number> };
  updatedAt: number;
}

async function fetchMarketIndex(): Promise<MarketIndexResponse> {
  const res = await fetch(`${API_BASE}/api/market-index`);
  if (!res.ok) throw new Error(`Market index API error: ${res.status}`);
  return res.json();
}

export function useMarketIndex() {
  return useQuery({
    queryKey: ["market-index"],
    queryFn: fetchMarketIndex,
    refetchInterval: 5 * 60 * 1000,
  });
}
