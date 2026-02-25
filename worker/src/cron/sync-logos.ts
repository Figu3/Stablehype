import { getCache, setCache } from "../lib/db";
import { fetchWithRetry } from "../lib/fetch-retry";

const COINGECKO_MARKETS = "https://api.coingecko.com/api/v3/coins/markets";

interface CoinGeckoMarketItem {
  id: string;
  image: string;
}

/**
 * Sync stablecoin logos from CoinGecko.
 *
 * Reads the stablecoins cache (written by sync-stablecoins) to collect geckoIds,
 * then batch-fetches image URLs from CoinGecko /coins/markets.
 *
 * On the first run the full set is fetched; on subsequent runs only new/missing
 * logos are resolved, keeping CoinGecko API usage minimal.
 */
export async function syncLogos(db: D1Database): Promise<void> {
  // 1. Read stablecoins cache to get asset ID -> geckoId mapping
  const stablecoinsCache = await getCache(db, "stablecoins");
  if (!stablecoinsCache) {
    console.warn("[sync-logos] No stablecoins cache found, skipping");
    return;
  }

  let assets: Array<{ id: string; geckoId?: string | null }>;
  try {
    const data = JSON.parse(stablecoinsCache.value) as {
      peggedAssets: Array<{ id: string; geckoId?: string | null }>;
    };
    assets = data.peggedAssets ?? [];
  } catch {
    console.error("[sync-logos] Failed to parse stablecoins cache");
    return;
  }

  // Build geckoId -> DefiLlama ID mapping (only assets with valid geckoIds)
  const geckoToId = new Map<string, string>();
  for (const coin of assets) {
    if (coin.geckoId && typeof coin.geckoId === "string") {
      geckoToId.set(coin.geckoId, coin.id);
    }
  }

  if (geckoToId.size === 0) {
    console.warn("[sync-logos] No assets with geckoIds found");
    return;
  }

  // 2. Read existing logo cache
  const logosCache = await getCache(db, "stablecoin-logos");
  const existingLogos: Record<string, string> = logosCache
    ? JSON.parse(logosCache.value)
    : {};

  // 3. Find geckoIds missing from cache
  const missingGeckoIds: string[] = [];
  for (const [geckoId, dlId] of geckoToId) {
    if (!existingLogos[dlId]) {
      missingGeckoIds.push(geckoId);
    }
  }

  if (missingGeckoIds.length === 0) {
    console.log(`[sync-logos] All ${geckoToId.size} logos cached, nothing to fetch`);
    return;
  }

  console.log(`[sync-logos] Fetching ${missingGeckoIds.length} missing logos from CoinGecko`);

  // 4. Batch-fetch from CoinGecko (max 250 IDs per request)
  const newLogos: Record<string, string> = {};
  const batches = chunk(missingGeckoIds, 250);

  for (let i = 0; i < batches.length; i++) {
    const ids = batches[i].join(",");
    const res = await fetchWithRetry(
      `${COINGECKO_MARKETS}?vs_currency=usd&ids=${ids}&per_page=250`,
      undefined,
      2,
      { timeoutMs: 20_000 },
    );

    if (res?.ok) {
      const data = (await res.json()) as CoinGeckoMarketItem[];
      for (const item of data) {
        const dlId = geckoToId.get(item.id);
        if (dlId && item.image) {
          // CoinGecko returns /large/ images — switch to /small/ for lighter payloads
          newLogos[dlId] = item.image.replace("/large/", "/small/");
        }
      }
    } else {
      console.warn(`[sync-logos] CoinGecko batch ${i + 1}/${batches.length} failed`);
    }

    // Rate-limit courtesy between batches
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // 5. Merge: new logos added to existing (existing are preserved)
  const merged = { ...existingLogos, ...newLogos };

  if (Object.keys(merged).length === 0) {
    console.warn("[sync-logos] No logos to write, skipping");
    return;
  }

  await setCache(db, "stablecoin-logos", JSON.stringify(merged));
  console.log(
    `[sync-logos] Cached ${Object.keys(merged).length} logos (${Object.keys(newLogos).length} new)`,
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
