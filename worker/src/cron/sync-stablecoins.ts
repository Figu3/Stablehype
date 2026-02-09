import { setCache } from "../lib/db";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const SUPPLEMENTARY_COINS: Record<string, string> = {
  "gold-xaut": "tether-gold",
  "gold-paxg": "pax-gold",
};

interface CoinGeckoMarketCoin {
  id: string;
  name: string;
  symbol: string;
  current_price: number;
  market_cap: number;
  total_supply: number;
  circulating_supply: number;
  price_change_percentage_24h: number;
}

async function fetchGoldTokens(): Promise<unknown[]> {
  try {
    const geckoIds = Object.values(SUPPLEMENTARY_COINS).join(",");
    const res = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${geckoIds}&per_page=50&sparkline=false`
    );
    if (!res.ok) return [];

    const coins: CoinGeckoMarketCoin[] = await res.json();

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
      };
    });
  } catch {
    return [];
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

  const llamaData = await llamaRes.json() as { peggedAssets: unknown[] };

  if (goldTokens.length) {
    llamaData.peggedAssets = [...llamaData.peggedAssets, ...goldTokens];
  }

  await setCache(db, "stablecoins", JSON.stringify(llamaData));
  console.log(`[sync-stablecoins] Cached ${llamaData.peggedAssets.length} assets`);
}
