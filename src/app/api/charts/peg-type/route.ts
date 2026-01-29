import { NextResponse } from "next/server";

/**
 * Returns historical supply data for alternative (non-USD) peg currencies.
 * Source: DefiLlama /stablecoincharts/all (already aggregated by pegType).
 * Gold data comes from CoinGecko (current snapshot only — shown as flat line).
 * Returns the last 365 days, sampled weekly.
 */

const COINGECKO_GOLD_IDS = "tether-gold,pax-gold";

export async function GET() {
  try {
    // Fetch DefiLlama aggregate + CoinGecko gold data in parallel
    const [llamaRes, goldRes] = await Promise.all([
      fetch("https://stablecoins.llama.fi/stablecoincharts/all", {
        next: { revalidate: 3600 },
      }),
      fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINGECKO_GOLD_IDS}&sparkline=false`,
        { next: { revalidate: 3600 } }
      ).catch(() => null),
    ]);

    if (!llamaRes.ok) {
      return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 502 });
    }

    // Gold total mcap (current snapshot)
    let goldMcap = 0;
    if (goldRes?.ok) {
      try {
        const goldCoins: { market_cap: number }[] = await goldRes.json();
        goldMcap = goldCoins.reduce((s, c) => s + (c.market_cap ?? 0), 0);
      } catch { /* ignore */ }
    }

    const raw: {
      date: string;
      totalCirculatingUSD: Record<string, number>;
    }[] = await llamaRes.json();

    // Last 365 days, sample every 7 days
    const now = Date.now() / 1000;
    const oneYearAgo = now - 365 * 86400;

    const sampled = raw.filter((d, i) => {
      const ts = Number(d.date);
      return ts >= oneYearAgo && i % 7 === 0;
    });

    // Non-USD pegs we show individually
    const SHOWN_PEGS = ["peggedEUR", "peggedCHF", "peggedGBP", "peggedREAL", "peggedRUB"];

    const result = sampled.map((d) => {
      const entry: Record<string, number> = { date: Number(d.date) };
      const circ = d.totalCirculatingUSD ?? {};

      for (const peg of SHOWN_PEGS) {
        entry[peg] = circ[peg] ?? 0;
      }

      // Gold: current snapshot applied uniformly (no historical data available)
      entry["peggedGOLD"] = goldMcap;

      // "Other" = everything except USD and the pegs we show individually
      let other = 0;
      for (const [peg, val] of Object.entries(circ)) {
        if (peg !== "peggedUSD" && !SHOWN_PEGS.includes(peg)) {
          other += val ?? 0;
        }
      }
      entry["other"] = other;

      return entry;
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
