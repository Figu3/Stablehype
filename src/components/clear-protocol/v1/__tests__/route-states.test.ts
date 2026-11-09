import { describe, expect, it } from "vitest";
import type { ClearV1Hop, ClearV1SpotLeg, ClearV1State } from "@/hooks/use-clear-v1";
import { basketReason, stepState } from "../route-states";

const GHO = "0xgho";
const USDC = "0xusdc";
const hop = (open: boolean | null, via: ClearV1Hop["via"] = "swap"): ClearV1Hop =>
  ({ reserve: "0xr", tokenIn: "a", tokenOut: "b", via, open });
const native = (enter: boolean | null, exit: boolean | null): ClearV1SpotLeg =>
  ({ token: GHO, kind: "native", enter: hop(enter), exit: hop(exit) });
const baseLeg = (enter: boolean | null, exit: boolean | null): ClearV1SpotLeg =>
  ({ token: USDC, kind: "base", enter: hop(enter, "deposit"), exit: hop(exit, "withdraw") });
const feed = (price: number, redemptionPrice: number): ClearV1State["feeds"] =>
  [{ asset: GHO, symbol: "GHO", lastUpdate: 0, ttl: 3600, price, redemptionPrice }];
const basket = (price: number, offBps = 1): ClearV1State["basket"] =>
  ({ price, redemptionPrice: 1, offBps, proximityBps: 3 });

describe("stepState", () => {
  it("says Open and Unknown as read", () => {
    expect(stepState(native(true, null), "enter", [], null)).toEqual({ open: true, label: "Open" });
    expect(stepState(native(true, null), "exit", [], null)).toEqual({ open: null, label: "Unknown" });
  });
  it("calls a shut native entry At peg when its oracle price is at or above redemption", () => {
    expect(stepState(native(false, false), "enter", feed(0.9992, 0.9988), null).label).toBe("At peg");
    expect(stepState(native(false, false), "enter", feed(0.998, 0.9988), null).label).toBe("Spread out of range");
    expect(stepState(native(false, false), "enter", [], null).label).toBe("Shut");
  });
  it("judges a native's exit by bLP, through the Base basket", () => {
    expect(stepState(native(false, false), "exit", [], basket(1.0001)).label).toBe("bLP at peg");
    expect(stepState(native(false, false), "exit", [], basket(0.99)).label).toBe("Spread out of range");
  });
  it("blames the basket for a shut Base entry or exit", () => {
    expect(stepState(baseLeg(false, true), "enter", [], null).label).toBe("Basket off peg");
  });
});

describe("basketReason", () => {
  it("is null while Base entry and exit are open", () => {
    expect(basketReason([baseLeg(true, true), native(false, false)], basket(0.9995))).toBeNull();
  });
  it("gives the basket's distance against the limit when that is the cause", () => {
    expect(basketReason([baseLeg(false, false)], basket(0.99956, 4.4)))
      .toBe("USDC and USDT entry and exit to bLP are paused: the Base basket is 4.4 bps from its redemption price (limit 3 bps).");
  });
  it("names no cause it cannot see", () => {
    expect(basketReason([baseLeg(false, true)], null)).toBe("USDC and USDT entry and exit to bLP are shut.");
  });
});
