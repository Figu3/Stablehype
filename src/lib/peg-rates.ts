import type { StablecoinData } from "./types";

/**
 * Derive peg reference rates from the DefiLlama data itself.
 * For each pegType, compute the median price of coins with mcap > $1M.
 * This gives us live FX rates (e.g. peggedEUR -> ~1.19 USD).
 *
 * Returns a map of pegType -> USD value of 1 unit of the peg currency.
 */
export function derivePegRates(assets: StablecoinData[]): Record<string, number> {
  const groups: Record<string, number[]> = {};

  for (const a of assets) {
    const peg = a.pegType;
    const price = a.price;
    if (!peg || price == null || typeof price !== "number" || isNaN(price) || price <= 0) continue;

    // Only use coins with meaningful supply to avoid garbage data
    const supply = a.circulating
      ? Object.values(a.circulating).reduce((s, v) => s + (v ?? 0), 0)
      : 0;
    if (supply < 1_000_000) continue;

    if (!groups[peg]) groups[peg] = [];
    groups[peg].push(price);
  }

  const rates: Record<string, number> = {};
  for (const [peg, prices] of Object.entries(groups)) {
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    rates[peg] =
      prices.length % 2 === 0
        ? (prices[mid - 1] + prices[mid]) / 2
        : prices[mid];
  }

  // Fallback: USD is always 1
  if (!rates["peggedUSD"]) rates["peggedUSD"] = 1;

  return rates;
}

/**
 * Get the expected USD price for a coin given its pegType and the derived rates.
 */
export function getPegReference(pegType: string | undefined, rates: Record<string, number>): number {
  if (!pegType) return 1;
  return rates[pegType] ?? 1;
}
