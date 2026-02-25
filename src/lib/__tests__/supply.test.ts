import { describe, it, expect } from "vitest";
import {
  getCirculatingRaw,
  getPrevDayRaw,
  getPrevWeekRaw,
  getPrevMonthRaw,
  getCirculatingUSD,
  getPrevDayUSD,
  getPrevWeekUSD,
} from "../supply";
import type { StablecoinData } from "../types";

function makeAsset(overrides: Partial<StablecoinData> = {}): StablecoinData {
  return {
    id: "1",
    name: "Test",
    symbol: "TST",
    geckoId: null,
    pegType: "peggedUSD",
    pegMechanism: "fiat-backed",
    price: 1.0,
    priceSource: "coingecko",
    circulating: { peggedUSD: 5_000_000 },
    circulatingPrevDay: { peggedUSD: 4_900_000 },
    circulatingPrevWeek: { peggedUSD: 4_500_000 },
    circulatingPrevMonth: { peggedUSD: 4_000_000 },
    chainCirculating: {},
    chains: ["Ethereum"],
    ...overrides,
  };
}

describe("getCirculatingRaw", () => {
  it("sums all chain values", () => {
    const asset = makeAsset({
      circulating: { peggedUSD: 3_000_000, peggedEUR: 2_000_000 },
    });
    expect(getCirculatingRaw(asset)).toBe(5_000_000);
  });

  it("returns 0 for undefined circulating", () => {
    const asset = makeAsset({ circulating: undefined as unknown as Record<string, number> });
    expect(getCirculatingRaw(asset)).toBe(0);
  });

  it("treats null values as 0", () => {
    const asset = makeAsset({
      circulating: { peggedUSD: 3_000_000, peggedEUR: null as unknown as number },
    });
    expect(getCirculatingRaw(asset)).toBe(3_000_000);
  });
});

describe("getPrevDayRaw", () => {
  it("sums previous day values", () => {
    const asset = makeAsset({ circulatingPrevDay: { peggedUSD: 4_900_000 } });
    expect(getPrevDayRaw(asset)).toBe(4_900_000);
  });

  it("returns 0 for undefined", () => {
    const asset = makeAsset({ circulatingPrevDay: undefined as unknown as Record<string, number> });
    expect(getPrevDayRaw(asset)).toBe(0);
  });
});

describe("getPrevWeekRaw", () => {
  it("sums previous week values", () => {
    const asset = makeAsset({ circulatingPrevWeek: { peggedUSD: 4_500_000 } });
    expect(getPrevWeekRaw(asset)).toBe(4_500_000);
  });
});

describe("getPrevMonthRaw", () => {
  it("sums previous month values", () => {
    const asset = makeAsset({ circulatingPrevMonth: { peggedUSD: 4_000_000 } });
    expect(getPrevMonthRaw(asset)).toBe(4_000_000);
  });
});

describe("getCirculatingUSD", () => {
  it("converts using FX rates", () => {
    const asset = makeAsset({
      circulating: { peggedUSD: 1_000_000, peggedEUR: 500_000 },
    });
    const rates = { peggedUSD: 1, peggedEUR: 1.08 };
    // 1M * 1 + 500K * 1.08 = 1,540,000
    expect(getCirculatingUSD(asset, rates)).toBeCloseTo(1_540_000, 0);
  });

  it("uses rate=1 for unknown peg types", () => {
    const asset = makeAsset({
      circulating: { peggedXYZ: 1_000_000 },
    });
    expect(getCirculatingUSD(asset, {})).toBe(1_000_000);
  });

  it("skips FX conversion for gold (rate=1)", () => {
    const asset = makeAsset({
      circulating: { peggedGOLD: 500_000 },
    });
    // Gold values are already in USD (CoinGecko mcap), rate should be 1
    expect(getCirculatingUSD(asset, { peggedGOLD: 3100 })).toBe(500_000);
  });
});

describe("getPrevDayUSD", () => {
  it("converts previous day values", () => {
    const asset = makeAsset({ circulatingPrevDay: { peggedUSD: 2_000_000 } });
    expect(getPrevDayUSD(asset, { peggedUSD: 1 })).toBe(2_000_000);
  });
});

describe("getPrevWeekUSD", () => {
  it("converts previous week values", () => {
    const asset = makeAsset({ circulatingPrevWeek: { peggedEUR: 1_000_000 } });
    expect(getPrevWeekUSD(asset, { peggedEUR: 1.08 })).toBeCloseTo(1_080_000, 0);
  });
});
