import { setCache } from "../lib/db";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";
const DEFILLAMA_COINS = "https://coins.llama.fi";
const DEFILLAMA_API = "https://api.llama.fi";

interface GoldTokenConfig {
  internalId: string;
  geckoId: string;
  protocolSlug: string;
  name: string;
  symbol: string;
  goldOunces: number; // troy ounces per token (1 for XAUT/PAXG, 1/31.1035 for gram tokens)
}

const GOLD_TOKENS: GoldTokenConfig[] = [
  { internalId: "gold-xaut", geckoId: "tether-gold", protocolSlug: "tether-gold", name: "Tether Gold", symbol: "XAUT", goldOunces: 1 },
  { internalId: "gold-paxg", geckoId: "pax-gold", protocolSlug: "paxos-gold", name: "PAX Gold", symbol: "PAXG", goldOunces: 1 },
  { internalId: "gold-kau", geckoId: "kinesis-gold", protocolSlug: "", name: "Kinesis Gold", symbol: "KAU", goldOunces: 1 / 31.1035 },
  { internalId: "gold-xaum", geckoId: "matrixdock-gold", protocolSlug: "", name: "Matrixdock Gold", symbol: "XAUm", goldOunces: 1 },
];

interface DefiLlamaCoinPrice {
  price: number;
  symbol: string;
  timestamp: number;
  confidence: number;
}

async function fetchGoldTokens(): Promise<unknown[]> {
  try {
    // Fetch prices from DefiLlama coins API
    const coinIds = GOLD_TOKENS.map((t) => `coingecko:${t.geckoId}`).join(",");
    const priceRes = await fetch(`${DEFILLAMA_COINS}/prices/current/${coinIds}`);
    if (!priceRes.ok) {
      console.error(`[gold] Price fetch failed: ${priceRes.status}`);
      return [];
    }
    const priceData = (await priceRes.json()) as { coins: Record<string, DefiLlamaCoinPrice> };

    // Fetch market caps from DefiLlama protocol API (only for tokens with protocolSlug)
    const mcapMap: Record<string, number> = {};
    const protocolFetches = GOLD_TOKENS
      .filter((t) => t.protocolSlug)
      .map(async (t) => {
        try {
          const res = await fetch(`${DEFILLAMA_API}/protocol/${t.protocolSlug}`);
          if (!res.ok) return;
          const data = (await res.json()) as { mcap?: number };
          if (data.mcap) mcapMap[t.internalId] = data.mcap;
        } catch {
          // Skip this token
        }
      });
    await Promise.all(protocolFetches);

    return GOLD_TOKENS
      .map((token) => {
        const priceInfo = priceData.coins[`coingecko:${token.geckoId}`];
        if (!priceInfo) return null;

        // Use protocol mcap if available, otherwise estimate from price
        // For tokens without protocol data, we skip them (no reliable mcap source)
        const mcap = mcapMap[token.internalId];
        if (!mcap) {
          console.log(`[gold] No mcap for ${token.symbol}, skipping`);
          return null;
        }

        return {
          id: token.internalId,
          name: token.name,
          symbol: token.symbol,
          geckoId: token.geckoId,
          pegType: "peggedGOLD",
          pegMechanism: "rwa-backed",
          price: priceInfo.price,
          priceSource: "defillama",
          circulating: { peggedGOLD: mcap },
          circulatingPrevDay: { peggedGOLD: mcap },
          circulatingPrevWeek: { peggedGOLD: mcap },
          circulatingPrevMonth: { peggedGOLD: mcap },
          chainCirculating: {},
          chains: ["Ethereum"],
          goldOunces: token.goldOunces,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
  } catch (err) {
    console.error("[gold] fetchGoldTokens failed:", err);
    return [];
  }
}

interface PeggedAsset {
  id: string;
  name: string;
  symbol: string;
  address?: string;
  geckoId?: string;
  price?: number | null;
  [key: string]: unknown;
}

/**
 * Enrich assets that are missing prices by fetching from the DefiLlama coins API.
 * Two-pass approach:
 *   1. Contract addresses (ethereum: or solana: prefix) — most reliable
 *   2. CoinGecko IDs — fallback for coins where contract lookup fails
 */
async function enrichMissingPrices(assets: PeggedAsset[]): Promise<void> {
  // Find assets missing prices that have a contract address
  const missing: { index: number; coinId: string }[] = [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    if (a.price != null && typeof a.price === "number") continue;
    if (!a.address) continue;

    const isEvm = a.address.startsWith("0x");
    const coinId = isEvm ? `ethereum:${a.address}` : `solana:${a.address}`;
    missing.push({ index: i, coinId });
  }

  if (missing.length === 0) return;

  try {
    // Pass 1: contract addresses
    const coinIds = missing.map((m) => m.coinId).join(",");
    const res = await fetch(`${DEFILLAMA_COINS}/prices/current/${coinIds}`);
    if (!res.ok) {
      console.warn(`[sync-stablecoins] Coins API price fetch failed: ${res.status}`);
      return;
    }
    const data = (await res.json()) as { coins: Record<string, DefiLlamaCoinPrice> };

    let enriched = 0;
    const stillMissing: { index: number; geckoId: string }[] = [];

    for (const m of missing) {
      const priceInfo = data.coins[m.coinId];
      if (priceInfo?.price != null) {
        assets[m.index].price = priceInfo.price;
        enriched++;
      } else {
        // Queue for CoinGecko ID fallback (skip IDs containing "wrong")
        const geckoId = assets[m.index].geckoId;
        if (geckoId && !geckoId.includes("wrong")) {
          stillMissing.push({ index: m.index, geckoId });
        }
      }
    }

    // Pass 2: CoinGecko IDs via DefiLlama proxy for remaining
    const afterPass2: { index: number; geckoId: string }[] = [];
    if (stillMissing.length > 0) {
      const geckoIds = stillMissing.map((m) => `coingecko:${m.geckoId}`).join(",");
      const geckoRes = await fetch(`${DEFILLAMA_COINS}/prices/current/${geckoIds}`);
      if (geckoRes.ok) {
        const geckoData = (await geckoRes.json()) as { coins: Record<string, DefiLlamaCoinPrice> };
        for (const m of stillMissing) {
          const priceInfo = geckoData.coins[`coingecko:${m.geckoId}`];
          if (priceInfo?.price != null) {
            assets[m.index].price = priceInfo.price;
            enriched++;
          } else {
            afterPass2.push(m);
          }
        }
      } else {
        afterPass2.push(...stillMissing);
      }
    }

    // Pass 3: CoinGecko direct API for coins DefiLlama doesn't track at all
    if (afterPass2.length > 0) {
      const ids = afterPass2.map((m) => m.geckoId).join(",");
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
      );
      if (cgRes.ok) {
        const cgData = (await cgRes.json()) as Record<string, { usd?: number }>;
        for (const m of afterPass2) {
          if (cgData[m.geckoId]?.usd != null) {
            assets[m.index].price = cgData[m.geckoId].usd!;
            enriched++;
          }
        }
      }
    }

    if (enriched > 0) {
      console.log(`[sync-stablecoins] Enriched prices for ${enriched}/${missing.length} assets`);
    }
  } catch (err) {
    console.warn("[sync-stablecoins] Price enrichment failed:", err);
  }
}

export async function syncStablecoins(db: D1Database): Promise<void> {
  const [llamaRes, goldTokens] = await Promise.all([
    fetch(`${DEFILLAMA_BASE}/stablecoins?includePrices=true`),
    fetchGoldTokens(),
  ]);

  if (!llamaRes.ok) {
    console.error(`[sync-stablecoins] DefiLlama API error: ${llamaRes.status}`);
    return;
  }

  const llamaData = await llamaRes.json() as { peggedAssets: PeggedAsset[] };

  if (goldTokens.length) {
    llamaData.peggedAssets = [...llamaData.peggedAssets, ...goldTokens as PeggedAsset[]];
  }

  // Enrich any assets that DefiLlama didn't provide prices for
  await enrichMissingPrices(llamaData.peggedAssets);

  await setCache(db, "stablecoins", JSON.stringify(llamaData));
  console.log(`[sync-stablecoins] Cached ${llamaData.peggedAssets.length} assets`);
}
