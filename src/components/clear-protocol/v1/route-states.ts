import type { ClearV1Quote, ClearV1State } from "@/hooks/use-clear-v1";

type Feeds = ClearV1State["feeds"];

const BASE_GATE = "OffRedemptionPrice";

/** Distance of an asset's oracle price from its redemption price, in bps (absolute). */
export function offBps(feeds: Feeds, asset: string): number | null {
  const f = feeds.find((x) => x.asset === asset);
  if (f?.price == null || f.redemptionPrice == null || f.redemptionPrice === 0) return null;
  return (Math.abs(f.price - f.redemptionPrice) / f.redemptionPrice) * 1e4;
}

/** Units of tokenOut per unit of tokenIn, null when the route does not quote. */
export const rate = (q: ClearV1Quote): number | null => (q.amountOut === null ? null : q.amountOut / q.amountIn);

/**
 * The base rate of a pair: the two tokens' redemption prices crossed, before fees. A Base rate swap pays this
 * less Clear's fees; it is shown for every pair, quoting or not, as the reference.
 */
export function baseRate(tokenIn: string, tokenOut: string, feeds: Feeds): number | null {
  const rIn = feeds.find((f) => f.asset === tokenIn)?.redemptionPrice;
  const rOut = feeds.find((f) => f.asset === tokenOut)?.redemptionPrice;
  return rIn == null || rOut == null || rOut === 0 ? null : rIn / rOut;
}

/**
 * The quote against the two tokens' oracle prices, in bps: positive means the trader gets more than
 * the market cross-rate. null when the route does not quote or a price is missing.
 */
export function vsMarketBps(q: ClearV1Quote, feeds: Feeds): number | null {
  const r = rate(q);
  const pIn = feeds.find((f) => f.asset === q.tokenIn)?.price;
  const pOut = feeds.find((f) => f.asset === q.tokenOut)?.price;
  if (r === null || pIn == null || pOut == null || pOut === 0) return null;
  return (r / (pIn / pOut) - 1) * 1e4;
}

/**
 * How the route trades, or why it does not, in plain words. "Open" is Clear's depeg route; "Base rate" fills at
 * the redemption cross-rate (the baseline swap). Base's gate (OffRedemptionPrice) shuts every
 * USDC or USDT entry and exit to bLP when any Base asset is more than proximityBps from its redemption price.
 */
/** Quoting routes for the default view: Open (depeg route) before Base rate, then best rate against market. */
export function liveRoutes(quotes: ClearV1Quote[], feeds: Feeds): ClearV1Quote[] {
  const rank = (q: ClearV1Quote) => (q.pricing === "depeg" ? 0 : 1);
  return quotes
    .filter((q) => q.amountOut !== null)
    .sort((a, b) => rank(a) - rank(b) || (vsMarketBps(b, feeds) ?? -Infinity) - (vsMarketBps(a, feeds) ?? -Infinity));
}

export function quoteStatus(q: ClearV1Quote, feeds: Feeds, baseAssets: string[], proximityBps: number | null,
  name: (a: string) => string): { ok: boolean; label: string } {
  if (q.pricing === "depeg") return { ok: true, label: "Open" };
  if (q.pricing === "redemption") return { ok: true, label: "Base rate" };
  if (q.amountOut !== null) return { ok: true, label: "Quoted" };
  const error = q.hops.find((h) => h.error)?.error ?? null;
  if (error === BASE_GATE) {
    const off = proximityBps === null ? [] : baseAssets.filter((a) => (offBps(feeds, a) ?? 0) > proximityBps);
    return { ok: false, label: off.length ? `${off.map(name).join(", ")} off peg (Base gate)` : "Base gate shut" };
  }
  if (error === "QuoteUnavailable") return { ok: false, label: "No quote: spread out of range" };
  if (error === "DepegQuoteBelowPar") return { ok: false, label: "Refused: depeg quote below par" };
  return { ok: false, label: error ? `Reverts (${error})` : "Not quoted" };
}
