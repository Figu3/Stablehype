import { describe, expect, it } from "vitest";
import { encodeErrorResult, parseAbi } from "viem";
import { assemble, errorName, QUOTE_SIZE } from "../clear-v1-quotes";
import { spotRoutes } from "../../cron/sync-clear-v1-state";
import { V1_RESERVES, V1_TOKENS } from "@shared/lib/clear-v1-config";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const USDS = "0xdc035d45d973e3ec169d2276ddab16f1e407384f";
const PYUSD = "0x6c3ea9036406852006290770bedfcaba0e23a0e8";
const routes = spotRoutes(V1_RESERVES, () => null);
const dec = (t: string) => V1_TOKENS[t]?.decimals ?? 18;
const find = (qs: ReturnType<typeof assemble>, a: string, b: string) => qs.find((q) => q.tokenIn === a && q.tokenOut === b)!;

describe("assemble", () => {
  // Real trade 0xddb5fa07 (block 26347842): 220 USDS to 219.714904 bLP on Meta USDS, then 219.692094 USDC
  // from Base. Previews at the block before returned these exact amounts.
  const qs = assemble(routes, dec,
    (h) => h.via === "swap" && h.tokenIn === USDS ? { amount: 219714904042514547804n, depeg: false }
      : h.via === "deposit" ? { error: "OffRedemptionPrice" }
      : h.tokenIn === USDT ? { amount: 1863429149n, depeg: true }
      : { error: "DepegQuoteBelowPar" },
    (r) => r.tokenOut === USDC ? { amount: 219692094n, depeg: null } : { error: "QuoteUnavailable" });

  it("chains a native's Meta swap into Base's withdraw, in each step's units", () => {
    const q = find(qs, USDS, USDC);
    expect(q.amountIn).toBe(QUOTE_SIZE);
    expect(q.amountOut).toBeCloseTo(219.692094, 6);
    expect(q.hops.map((h) => [h.via, h.amountOut])).toEqual([["swap", 219.714904042514547804], ["withdraw", 219.692094]]);
    expect(q.pricing).toBe("redemption"); // the only swap step was not on its depeg route
  });
  it("prices a direct Base swap by its own depeg flag", () => {
    expect(find(qs, USDT, USDC)).toMatchObject({ amountOut: 1863.429149, pricing: "depeg" });
  });
  it("has no amount or pricing when a step reverts, and names the revert", () => {
    expect(find(qs, USDC, USDS)).toMatchObject({ amountOut: null, pricing: null });
    expect(find(qs, USDC, USDS).hops.map((h) => h.error)).toEqual(["OffRedemptionPrice", null]);
    expect(find(qs, USDS, PYUSD).hops[1].error).toBe("QuoteUnavailable");
  });
});

describe("errorName", () => {
  it("decodes Clear's quote reverts, and falls back to the selector", () => {
    const abi = parseAbi(["error DepegQuoteBelowPar(address asset, uint256 a, uint256 b)"]);
    expect(errorName(encodeErrorResult({ abi, errorName: "DepegQuoteBelowPar", args: [PYUSD, 1n, 2n] }))).toBe("DepegQuoteBelowPar");
    expect(errorName("0xdeadbeef")).toBe("revert 0xdeadbeef");
  });
});
