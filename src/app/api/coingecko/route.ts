import { NextResponse } from "next/server";

/**
 * Fetches supplementary market data from CoinGecko for tokens not covered
 * by DefiLlama's stablecoins API (e.g. gold-pegged tokens like XAUT, PAXG).
 *
 * Returns data shaped to match the DefiLlama peggedAssets format so the
 * frontend can merge the two sources seamlessly.
 */

// Map our internal IDs to CoinGecko IDs
const SUPPLEMENTARY_COINS: Record<string, string> = {
  "gold-xaut": "tether-gold",
  "gold-paxg": "pax-gold",
};

export async function GET() {
  try {
    const geckoIds = Object.values(SUPPLEMENTARY_COINS).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${geckoIds}&per_page=50&sparkline=false`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      return NextResponse.json({ coins: [] }, { status: 200 });
    }

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

    // Shape as DefiLlama-compatible peggedAssets
    const peggedAssets = coins.map((coin) => {
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

    return NextResponse.json({ coins: peggedAssets });
  } catch {
    return NextResponse.json({ coins: [] }, { status: 200 });
  }
}
