import { describe, expect, it } from "vitest";
import { isCurrent, lookThrough, putIn, sharesSentAway, type ReserveState } from "../seve-lp";

describe("lookThrough", () => {
  // Shaped like 17 Nov 2026: Sève holds every meta share, and the base shares through the meta reserve and directly.
  const meta: ReserveState = { address: "meta", supply: 24_594, held: 24_594, balances: [{ token: "pyusd", amount: 7_503 }, { token: "base", amount: 68_276 }] };
  const base: ReserveState = { address: "base", supply: 70_100, held: 1_824, balances: [{ token: "usdc", amount: 35_286 }, { token: "usdt", amount: 35_345 }] };

  it("counts base shares held through a meta reserve", () => {
    const h = Object.fromEntries(lookThrough([meta, base]).map((x) => [x.token, x.amount]));
    expect(h.pyusd).toBe(7_503);
    expect(h.usdc).toBeCloseTo(35_286, 6);
    expect(h.usdt).toBeCloseTo(35_345, 6);
    expect(h.base).toBeUndefined();
  });
  it("scales by the fraction of shares held", () => {
    const half = { ...meta, held: 12_297 };
    const h = Object.fromEntries(lookThrough([half, base]).map((x) => [x.token, x.amount]));
    expect(h.pyusd).toBeCloseTo(3_751.5, 6);
    expect(h.usdc).toBeCloseTo((35_286 * (1_824 + 34_138)) / 70_100, 6);
  });
  it("skips a reserve with no shares", () => {
    expect(lookThrough([{ ...meta, supply: 0, held: 0 }])).toEqual([]);
  });
});

describe("putIn", () => {
  it("nets one-way transactions and ignores rebalances", () => {
    const net = Object.fromEntries(putIn([
      { txHash: "a", token: "usdc", direction: "out", amount: 2_000 },
      { txHash: "a", token: "usdt", direction: "out", amount: 2_000 },
      // A rebalance: USDC in, USDT out, in one transaction.
      { txHash: "b", token: "usdc", direction: "out", amount: 15_639.01 },
      { txHash: "b", token: "usdt", direction: "in", amount: 15_646.84 },
      { txHash: "c", token: "usds", direction: "in", amount: 219.95 },
    ]).map((x) => [x.token, x.amount]));
    expect(net).toEqual({ usdc: 2_000, usdt: 2_000, usds: -219.95 });
  });
  it("takes shares sent away out of what was put in, and adds shares received", () => {
    // Shaped like 26 Nov 2026: the meta shares bought with 7,503 PYUSD go to another Safe.
    const deposit = [{ txHash: "a", token: "pyusd", direction: "out" as const, amount: 7_503 }];
    const sent = { direction: "out" as const, value: [{ token: "pyusd", amount: 7_503 }, { token: "usdc", amount: 8_800 }, { token: "usdt", amount: 8_800 }] };
    const net = Object.fromEntries(putIn(deposit, [sent]).map((x) => [x.token, x.amount]));
    expect(net).toEqual({ pyusd: 0, usdc: -8_800, usdt: -8_800 });
    const back = Object.fromEntries(putIn([], [{ ...sent, direction: "in" }]).map((x) => [x.token, x.amount]));
    expect(back.pyusd).toBe(7_503);
  });
});

describe("sharesSentAway", () => {
  it("nets shares sent against shares received", () => {
    expect(sharesSentAway([
      { direction: "out", value: [{ token: "usdc", amount: 100 }, { token: "usdt", amount: 50 }] },
      { direction: "in", value: [{ token: "usdc", amount: 30 }] },
    ])).toBe(120);
  });
});

describe("isCurrent", () => {
  it("is false while the index is still backfilling", () => {
    expect(isCurrent(26_378_244, 26_433_476)).toBe(false);
    expect(isCurrent(26_433_400, 26_433_476)).toBe(true);
  });
});
