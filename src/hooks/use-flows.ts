"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { GaugeBand } from "@shared/lib/flows-scoring";

export interface FlowCoin {
  id: string;
  symbol: string;
  name: string;
  pegCurrency: string;
  governance: string;
  navToken: boolean;
  supplyUsd: number;
  flow24hUsd: number | null;
  flow7dUsd: number | null;
  flow30dUsd: number | null;
  pct24h: number | null;
  pct7d: number | null;
  pct30d: number | null;
  baselineDailyUsd: number | null;
  pressureScore: number | null;
}

export interface FlowsSummary {
  gauge: number | null;
  band: GaugeBand | null;
  mint24hUsd: number;
  burn24hUsd: number;
  net24hUsd: number;
  net7dUsd: number;
  net30dUsd: number;
  topMint24h: { id: string; symbol: string; flow24hUsd: number }[];
  topBurn24h: { id: string; symbol: string; flow24hUsd: number }[];
  coinsIncluded: number;
}

export interface FlowsResponse {
  coins: FlowCoin[];
  summary: FlowsSummary;
  methodology: { version: string };
  updatedAt: number;
}

async function fetchFlows(): Promise<FlowsResponse> {
  const res = await fetch(`${API_BASE}/api/flows`);
  if (!res.ok) throw new Error(`Flows API error: ${res.status}`);
  return res.json();
}

export function useFlows() {
  return useQuery({
    queryKey: ["flows"],
    queryFn: fetchFlows,
    refetchInterval: 5 * 60 * 1000,
  });
}
