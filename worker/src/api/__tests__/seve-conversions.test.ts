import { describe, expect, it } from "vitest";
import { pairConversions, type Transfer } from "../seve-conversions";

const USDC = "usdc", USDT = "usdt", USDG = "usdg";
const ISSUER = [USDG];
let n = 0;
const t = (direction: "out" | "in", token: string, amount: number): Transfer =>
  ({ txHash: `0x${++n}`, timestamp: n, token, direction, amount });

describe("pairConversions", () => {
  it("reads the 16 Nov loop: USDT mints USDG, USDG is burnt for USDC", () => {
    const { conversions, unpaired } = pairConversions([
      t("out", USDT, 19_473.503839), t("in", USDG, 19_473.46),
      t("out", USDG, 19_473.46), t("in", USDC, 19_473.880321),
    ], ISSUER);
    expect(unpaired).toBe(0);
    expect(conversions.map((c) => [c.kind, c.tokenIn, c.tokenOut])).toEqual([
      ["mint", USDT, USDG], ["burn", USDG, USDC],
    ]);
    expect(conversions[0].amountIn).toBeCloseTo(19_473.503839, 6);
    expect(conversions[1].amountOut).toBeCloseTo(19_473.880321, 6);
  });

  it("pairs two sends paid back at once", () => {
    const { conversions } = pairConversions([
      t("out", USDT, 15_687.08), t("out", USDT, 3_798.98), t("in", USDG, 19_486.02),
    ], ISSUER);
    expect(conversions).toHaveLength(1);
    expect(conversions[0].amountIn).toBeCloseTo(19_486.06, 6);
  });

  it("pairs two sends paid back one by one, in either order", () => {
    const { conversions, unpaired } = pairConversions([
      t("out", USDT, 15_687.08), t("out", USDT, 3_798.98),
      t("in", USDG, 3_798.95), t("in", USDG, 15_687.05),
    ], ISSUER);
    expect(unpaired).toBe(0);
    expect(conversions.map((c) => c.amountIn)).toEqual([3_798.98, 15_687.08]);
  });

  it("counts a receipt that matches no send instead of guessing", () => {
    const { conversions, unpaired } = pairConversions([t("out", USDT, 10_000), t("in", USDC, 219.91)], ISSUER);
    expect(conversions).toHaveLength(0);
    expect(unpaired).toBe(1);
  });

  it("calls a swap between two non-issuer stablecoins a conversion", () => {
    const { conversions } = pairConversions([t("out", USDT, 1_000), t("in", USDC, 1_000.1)], ISSUER);
    expect(conversions[0].kind).toBe("convert");
  });
});
