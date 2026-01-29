"use client";

import { useQuery } from "@tanstack/react-query";
import type { StablecoinListResponse, StablecoinData } from "@/lib/types";

async function fetchStablecoins(): Promise<StablecoinListResponse> {
  // Fetch both DefiLlama and supplementary CoinGecko data in parallel
  const [llamaRes, cgRes] = await Promise.all([
    fetch("/api/stablecoins"),
    fetch("/api/coingecko").catch(() => null),
  ]);

  if (!llamaRes.ok) throw new Error("Failed to fetch stablecoins");
  const llamaData: StablecoinListResponse = await llamaRes.json();

  // Merge supplementary coins (gold tokens etc.)
  if (cgRes?.ok) {
    try {
      const cgData: { coins: StablecoinData[] } = await cgRes.json();
      if (cgData.coins?.length) {
        llamaData.peggedAssets = [...llamaData.peggedAssets, ...cgData.coins];
      }
    } catch {
      // Ignore CoinGecko errors — DefiLlama data is sufficient
    }
  }

  return llamaData;
}

export function useStablecoins() {
  return useQuery({
    queryKey: ["stablecoins"],
    queryFn: fetchStablecoins,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

async function fetchStablecoinDetail(id: string) {
  const res = await fetch(`/api/stablecoins/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to fetch stablecoin ${id}`);
  return res.json();
}

export function useStablecoinDetail(id: string) {
  return useQuery({
    queryKey: ["stablecoin", id],
    queryFn: () => fetchStablecoinDetail(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}
