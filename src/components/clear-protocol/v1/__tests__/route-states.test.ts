import { describe, expect, it } from "vitest";
import type { ClearV1Hop, ClearV1SpotLeg, ClearV1State } from "@/hooks/use-clear-v1";
import { baseGateReason, offBps, stepState } from "../route-states";

const GHO = "0xgho";
const USDC = "0xusdc";
const USDT = "0xusdt";
const hop = (open: boolean | null, via: ClearV1Hop["via"] = "swap"): ClearV1Hop =>
  ({ reserve: "0xr", tokenIn: "a", tokenOut: "b", via, open });
const native = (enter: boolean | null, exit: boolean | null): ClearV1SpotLeg =>
  ({ token: GHO, kind: "native", enter: hop(enter), exit: hop(exit) });
const baseLeg = (token: string, enter: boolean | null, exit: boolean | null): ClearV1SpotLeg =>
  ({ token, kind: "base", enter: hop(enter, "deposit"), exit: hop(exit, "withdraw") });
const feed = (asset: string, price: number, redemptionPrice: number): ClearV1State["feeds"][number] =>
  ({ asset, symbol: asset, lastUpdate: 0, ttl: 3600, price, redemptionPrice });
const name = (a: string) => a.slice(2).toUpperCase();

describe("stepState", () => {
  it("says Open and Unknown as read", () => {
    expect(stepState(native(true, null), "enter", [])).toEqual({ open: true, label: "Open" });
    expect(stepState(native(true, null), "exit", [])).toEqual({ open: null, label: "Unknown" });
  });
  it("calls a shut native entry At peg when its oracle price is at or above redemption", () => {
    expect(stepState(native(false, false), "enter", [feed(GHO, 0.9992, 0.9988)]).label).toBe("At peg");
    expect(stepState(native(false, false), "enter", [feed(GHO, 0.998, 0.9988)]).label).toBe("Spread out of range");
    expect(stepState(native(false, false), "enter", []).label).toBe("Shut");
  });
  it("gives no cause for a shut native exit", () => {
    expect(stepState(native(false, false), "exit", [feed(GHO, 0.9992, 0.9988)]).label).toBe("Shut");
  });
  it("blames Base's gate for a shut Base entry or exit", () => {
    expect(stepState(baseLeg(USDC, false, true), "enter", []).label).toBe("Base gate shut");
  });
});

describe("baseGateReason", () => {
  // Mainnet 2026-11-09: USDT 0.99887058 against 0.9992 reverted OffRedemptionPrice for USDC and USDT.
  const feeds = [feed(USDC, 0.99977193, 1), feed(USDT, 0.99887058, 0.9992)];
  it("is null while Base entry and exit are open", () => {
    expect(baseGateReason([baseLeg(USDC, true, true), native(false, false)], feeds, 3, name)).toBeNull();
  });
  it("names each Base asset outside the limit, not the ones inside it", () => {
    expect(offBps(feeds, USDT)).toBeCloseTo(3.297, 2);
    expect(baseGateReason([baseLeg(USDC, false, false), baseLeg(USDT, false, false)], feeds, 3, name))
      .toBe("USDC and USDT entry and exit to bLP are shut: USDT is 3.3 bps from its redemption price (limit 3 bps).");
  });
  it("names no cause it cannot see", () => {
    expect(baseGateReason([baseLeg(USDC, false, true)], [feed(USDC, 1, 1)], 3, name))
      .toBe("USDC and USDT entry and exit to bLP are shut.");
    expect(baseGateReason([baseLeg(USDC, false, true)], feeds, null, name))
      .toBe("USDC and USDT entry and exit to bLP are shut.");
  });
});
