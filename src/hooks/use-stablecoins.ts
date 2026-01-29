"use client";

import { useQuery } from "@tanstack/react-query";
import type { StablecoinListResponse, StablecoinData } from "@/lib/types";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";

// Map our internal IDs to CoinGecko IDs for gold-pegged tokens
const SUPPLEMENTARY_COINS: Record<string, string> = {
  "gold-xaut": "tether-gold",
  "gold-paxg": "pax-gold",
};

async function fetchGoldTokens(): Promise<StablecoinData[]> {
  try {
    const geckoIds = Object.values(SUPPLEMENTARY_COINS).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${geckoIds}&per_page=50&sparkline=false`
    );

    if (!res.ok) return [];

    const coins: {
      id: string;
      name: string;
      symbol: string;
      current_price: number;
      market_cap: number;
      total_supply: number;
      circulating_supply: number;
      price_change_percentage_24h: number;
    }[] = await res.json();

    // Map CoinGecko IDs back to our internal IDs
    const geckoToInternal: Record<string, string> = {};
    for (const [internalId, geckoId] of Object.entries(SUPPLEMENTARY_COINS)) {
      geckoToInternal[geckoId] = internalId;
    }

    return coins.map((coin) => {
      const internalId = geckoToInternal[coin.id];
      const circulating = coin.circulating_supply ?? coin.total_supply ?? 0;
      const mcapValue = coin.market_cap ?? circulating * (coin.current_price ?? 0);

      return {
        id: internalId,
        name: coin.name,
        symbol: coin.symbol.toUpperCase(),
        geckoId: coin.id,
        pegType: "peggedGOLD",
        pegMechanism: "rwa-backed",
        price: coin.current_price,
        priceSource: "coingecko",
        circulating: { peggedGOLD: mcapValue },
        circulatingPrevDay: { peggedGOLD: mcapValue },
        circulatingPrevWeek: { peggedGOLD: mcapValue },
        circulatingPrevMonth: { peggedGOLD: mcapValue },
        chainCirculating: {},
        chains: ["Ethereum"],
      } as StablecoinData;
    });
  } catch {
    return [];
  }
}

async function fetchStablecoins(): Promise<StablecoinListResponse> {
  const [llamaRes, goldTokens] = await Promise.all([
    fetch(`${DEFILLAMA_BASE}/stablecoins?includePrices=true`),
    fetchGoldTokens(),
  ]);

  if (!llamaRes.ok) throw new Error("Failed to fetch stablecoins");
  const llamaData: StablecoinListResponse = await llamaRes.json();

  if (goldTokens.length) {
    llamaData.peggedAssets = [...llamaData.peggedAssets, ...goldTokens];
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
  const res = await fetch(`${DEFILLAMA_BASE}/stablecoin/${encodeURIComponent(id)}`);
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
