import { getCache, setCache } from "../lib/db";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const EXTRA_GECKO_IDS: Record<string, string> = {
  "tether-gold": "gold-xaut",
  "pax-gold": "gold-paxg",
};

export async function syncLogos(db: D1Database): Promise<void> {
  // Read stablecoin list from cache (avoids extra DefiLlama call)
  const cached = await getCache(db, "stablecoins");
  if (!cached) {
    console.warn("[sync-logos] No stablecoin cache found, skipping");
    return;
  }

  const data = JSON.parse(cached.value) as { peggedAssets: { id: string; gecko_id?: string }[] };
  const assets = data.peggedAssets ?? [];

  const geckoToLlama: Record<string, string> = {};
  for (const a of assets) {
    if (a.gecko_id) {
      geckoToLlama[a.gecko_id] = a.id;
    }
  }

  for (const [geckoId, internalId] of Object.entries(EXTRA_GECKO_IDS)) {
    geckoToLlama[geckoId] = internalId;
  }

  const geckoIds = Object.keys(geckoToLlama);
  if (geckoIds.length === 0) return;

  const logoMap: Record<string, string> = {};
  const batchSize = 250;

  for (let i = 0; i < geckoIds.length; i += batchSize) {
    const batch = geckoIds.slice(i, i + batchSize);
    const ids = batch.join(",");
    const res = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&per_page=${batchSize}&page=1&sparkline=false`
    );

    if (res.ok) {
      const coins: { id: string; image: string }[] = await res.json();
      for (const coin of coins) {
        const llamaId = geckoToLlama[coin.id];
        if (llamaId && coin.image) {
          logoMap[llamaId] = coin.image.replace("/large/", "/small/");
        }
      }
    }
  }

  await setCache(db, "logos", JSON.stringify(logoMap));
  console.log(`[sync-logos] Cached ${Object.keys(logoMap).length} logos`);
}
