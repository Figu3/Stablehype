import { describe, expect, it } from "vitest";
import type { ClearV1Quote, ClearV1State } from "@/hooks/use-clear-v1";
import { liveRoutes, offBps, quoteStatus, rate, vsMarketBps } from "../route-states";

const USDC = "0xusdc";
const USDT = "0xusdt";
const GHO = "0xgho";
const PYUSD = "0xpyusd";
const feed = (asset: string, price: number, redemptionPrice: number): ClearV1State["feeds"][number] =>
  ({ asset, symbol: asset, lastUpdate: 0, ttl: 3600, price, redemptionPrice });
// Mainnet 2026-11-09.
const feeds = [feed(USDC, 0.99977193, 1), feed(USDT, 0.99887058, 0.9992), feed(GHO, 0.99913963, 0.9988), feed(PYUSD, 0.99984044, 0.9999)];
const name = (a: string) => a.slice(2).toUpperCase();
const quote = (tokenIn: string, tokenOut: string, amountOut: number | null, pricing: ClearV1Quote["pricing"], error: string | null = null): ClearV1Quote => ({
  tokenIn, tokenOut, amountIn: 10_000, amountOut, pricing,
  hops: [{ reserve: "0xr", via: "swap", amountOut, depeg: null, error }],
});

describe("rate and vsMarketBps", () => {
  it("compares the quote to the oracle cross-rate", () => {
    const q = quote(GHO, PYUSD, 9983.01, "redemption"); // live quote 2026-11-09
    expect(rate(q)).toBeCloseTo(0.998301, 6);
    expect(vsMarketBps(q, feeds)).toBeCloseTo(-10.0, 0);
  });
  it("is null without a quote or a price", () => {
    expect(rate(quote(GHO, PYUSD, null, null))).toBeNull();
    expect(vsMarketBps(quote(GHO, "0xnone", 9990, "depeg"), feeds)).toBeNull();
  });
});

describe("quoteStatus", () => {
  it("says how a quoted route is priced", () => {
    expect(quoteStatus(quote(USDT, USDC, 9990.98, "depeg"), feeds, [USDC, USDT], 3, name)).toEqual({ ok: true, label: "Open" });
    expect(quoteStatus(quote(USDC, USDT, 9997, "redemption"), feeds, [USDC, USDT], 3, name).label).toBe("Base rate");
  });
  it("names the Base asset that shuts the gate", () => {
    expect(offBps(feeds, USDT)).toBeCloseTo(3.297, 2);
    expect(quoteStatus(quote(USDC, GHO, null, null, "OffRedemptionPrice"), feeds, [USDC, USDT], 3, name))
      .toEqual({ ok: false, label: "USDT off peg (Base gate)" });
    expect(quoteStatus(quote(USDC, GHO, null, null, "OffRedemptionPrice"), feeds, [USDC, USDT], null, name).label).toBe("Base gate shut");
  });
  it("words the Meta reverts and keeps unknown ones visible", () => {
    expect(quoteStatus(quote(GHO, USDT, null, null, "QuoteUnavailable"), feeds, [], 3, name).label).toBe("No quote: spread out of range");
    expect(quoteStatus(quote(PYUSD, GHO, null, null, "DepegQuoteBelowPar"), feeds, [], 3, name).label).toBe("Refused: depeg quote below par");
    expect(quoteStatus(quote(PYUSD, GHO, null, null, "revert 0xdeadbeef"), feeds, [], 3, name).label).toBe("Reverts (revert 0xdeadbeef)");
  });
});

describe("liveRoutes", () => {
  it("keeps quoting routes only, Open before Base rate, then best against market", () => {
    const qs = [
      quote(GHO, PYUSD, 9983.01, "redemption"),
      quote(USDC, GHO, null, null, "OffRedemptionPrice"),
      quote(GHO, USDC, 9995, "redemption"),
      quote(USDT, USDC, 9990.98, "depeg"),
    ];
    expect(liveRoutes(qs, feeds).map((q) => `${q.tokenIn}>${q.tokenOut}`)).toEqual([`${USDT}>${USDC}`, `${GHO}>${USDC}`, `${GHO}>${PYUSD}`]);
  });
});
