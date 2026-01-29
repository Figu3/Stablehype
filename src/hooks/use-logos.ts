"use client";

import { useQuery } from "@tanstack/react-query";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

// Supplementary coins not in DefiLlama (gold-pegged etc.)
const EXTRA_GECKO_IDS: Record<string, string> = {
  "tether-gold": "gold-xaut",
  "pax-gold": "gold-paxg",
};

async function fetchLogos(): Promise<Record<string, string>> {
  try {
    // Step 1: get gecko_ids from DefiLlama stablecoin list
    const llamaRes = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=true");
    if (!llamaRes.ok) return {};

    const llamaData = await llamaRes.json();
    const assets: { id: string; gecko_id?: string }[] = llamaData.peggedAssets ?? [];

    // Collect gecko_ids mapped to DefiLlama id
    const geckoToLlama: Record<string, string> = {};
    for (const a of assets) {
      if (a.gecko_id) {
        geckoToLlama[a.gecko_id] = a.id;
      }
    }

    // Add supplementary coins
    for (const [geckoId, internalId] of Object.entries(EXTRA_GECKO_IDS)) {
      geckoToLlama[geckoId] = internalId;
    }

    const geckoIds = Object.keys(geckoToLlama);
    if (geckoIds.length === 0) return {};

    // Step 2: batch fetch from CoinGecko markets (max 250 per request)
    const logoMap: Record<string, string> = {};
    const batchSize = 250;

    for (let i = 0; i < geckoIds.length; i += batchSize) {
      const batch = geckoIds.slice(i, i + batchSize);
      const ids = batch.join(",");
      const cgRes = await fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&per_page=${batchSize}&page=1&sparkline=false`
      );

      if (cgRes.ok) {
        const coins: { id: string; image: string }[] = await cgRes.json();
        for (const coin of coins) {
          const llamaId = geckoToLlama[coin.id];
          if (llamaId && coin.image) {
            // Replace "large" with "small" for faster loading
            logoMap[llamaId] = coin.image.replace("/large/", "/small/");
          }
        }
      }
    }

    return logoMap;
  } catch {
    return {};
  }
}

export function useLogos() {
  return useQuery({
    queryKey: ["logos"],
    queryFn: fetchLogos,
    staleTime: 24 * 60 * 60 * 1000, // 24h
    refetchInterval: false,
    retry: 1,
  });
}
