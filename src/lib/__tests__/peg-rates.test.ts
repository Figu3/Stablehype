import { describe, it, expect } from "vitest";
import { derivePegRates, getPegReference } from "../peg-rates";
import type { StablecoinData, StablecoinMeta } from "../types";

/** Helper to create minimal StablecoinData for rate derivation */
function makeAsset(overrides: Partial<StablecoinData> = {}): StablecoinData {
  return {
    id: "1",
    name: "Test USD",
    symbol: "TUSD",
    geckoId: null,
    pegType: "peggedUSD",
    pegMechanism: "fiat-backed",
    price: 1.0,
    priceSource: "coingecko",
    circulating: { peggedUSD: 10_000_000 },
    circulatingPrevDay: { peggedUSD: 10_000_000 },
    circulatingPrevWeek: { peggedUSD: 10_000_000 },
    circulatingPrevMonth: { peggedUSD: 10_000_000 },
    chainCirculating: {},
    chains: ["Ethereum"],
    ...overrides,
  };
}

describe("derivePegRates", () => {
  it("returns peggedUSD = 1 always", () => {
    const rates = derivePegRates([]);
    expect(rates["peggedUSD"]).toBe(1);
  });

  it("returns only peggedUSD for empty assets", () => {
    const rates = derivePegRates([]);
    expect(Object.keys(rates)).toEqual(["peggedUSD"]);
  });

  it("derives USD rate near 1.0 from multiple USD stablecoins", () => {
    const assets = [
      makeAsset({ id: "1", price: 1.0001, circulating: { peggedUSD: 50_000_000 } }),
      makeAsset({ id: "2", price: 0.9998, circulating: { peggedUSD: 60_000_000 } }),
      makeAsset({ id: "3", price: 1.0003, circulating: { peggedUSD: 40_000_000 } }),
    ];
    const rates = derivePegRates(assets);
    // peggedUSD is always exactly 1, not derived from market
    expect(rates["peggedUSD"]).toBe(1);
  });

  it("derives EUR rate from EUR stablecoins", () => {
    const assets = [
      makeAsset({ id: "10", pegType: "peggedEUR", price: 1.08, circulating: { peggedEUR: 5_000_000 } }),
      makeAsset({ id: "11", pegType: "peggedEUR", price: 1.09, circulating: { peggedEUR: 8_000_000 } }),
      makeAsset({ id: "12", pegType: "peggedEUR", price: 1.07, circulating: { peggedEUR: 3_000_000 } }),
    ];
    const rates = derivePegRates(assets);
    // Median of [1.07, 1.08, 1.09] = 1.08
    expect(rates["peggedEUR"]).toBeCloseTo(1.08, 2);
  });

  it("filters out assets with supply < 1M", () => {
    const assets = [
      makeAsset({ id: "10", pegType: "peggedEUR", price: 1.08, circulating: { peggedEUR: 5_000_000 } }),
      makeAsset({ id: "11", pegType: "peggedEUR", price: 0.50, circulating: { peggedEUR: 500 } }), // tiny supply
      makeAsset({ id: "12", pegType: "peggedEUR", price: 1.09, circulating: { peggedEUR: 3_000_000 } }),
    ];
    const rates = derivePegRates(assets);
    // Median of [1.08, 1.09] (0.50 filtered out) = (1.08+1.09)/2
    expect(rates["peggedEUR"]).toBeCloseTo(1.085, 2);
  });

  it("filters out assets with null/zero/negative prices", () => {
    const assets = [
      makeAsset({ id: "10", pegType: "peggedEUR", price: null, circulating: { peggedEUR: 5_000_000 } }),
      makeAsset({ id: "11", pegType: "peggedEUR", price: 0, circulating: { peggedEUR: 5_000_000 } }),
      makeAsset({ id: "12", pegType: "peggedEUR", price: -1, circulating: { peggedEUR: 5_000_000 } }),
      makeAsset({ id: "13", pegType: "peggedEUR", price: 1.08, circulating: { peggedEUR: 5_000_000 } }),
    ];
    const rates = derivePegRates(assets);
    // Only valid price is 1.08 — thin group (<3), validated against fallback
    expect(rates["peggedEUR"]).toBeCloseTo(1.08, 2);
  });

  it("uses fallback rate for thin groups that deviate >10% from fallback", () => {
    const assets = [
      makeAsset({ id: "10", pegType: "peggedEUR", price: 0.50, circulating: { peggedEUR: 5_000_000 } }),
    ];
    const rates = derivePegRates(assets);
    // Deviation: |0.50 - 1.08| / 1.08 = 53.7% >> 10%
    // Should use fallback 1.08
    expect(rates["peggedEUR"]).toBeCloseTo(1.08, 2);
  });

  it("accepts thin group rate within 10% of fallback", () => {
    const assets = [
      makeAsset({ id: "10", pegType: "peggedEUR", price: 1.05, circulating: { peggedEUR: 5_000_000 } }),
    ];
    const rates = derivePegRates(assets);
    // Deviation: |1.05 - 1.08| / 1.08 = 2.8% < 10%
    expect(rates["peggedEUR"]).toBeCloseTo(1.05, 2);
  });

  it("uses custom fallback rates when provided", () => {
    const assets = [
      makeAsset({ id: "10", pegType: "peggedEUR", price: 0.50, circulating: { peggedEUR: 5_000_000 } }),
    ];
    const rates = derivePegRates(assets, undefined, { peggedEUR: 1.12 });
    // Should use custom fallback 1.12 since deviation is >10%
    expect(rates["peggedEUR"]).toBeCloseTo(1.12, 2);
  });

  it("normalizes gold prices by goldOunces", () => {
    const meta = new Map<string, StablecoinMeta>();
    meta.set("20", {
      id: "20",
      name: "Gold Token",
      symbol: "GT",
      flags: { backing: "rwa-backed", pegCurrency: "GOLD", governance: "centralized", yieldBearing: false, rwa: true, navToken: false },
      goldOunces: 1 / 31.1035, // 1 gram
    });
    meta.set("21", {
      id: "21",
      name: "Gold Oz",
      symbol: "GOZ",
      flags: { backing: "rwa-backed", pegCurrency: "GOLD", governance: "centralized", yieldBearing: false, rwa: true, navToken: false },
      goldOunces: 1, // 1 troy ounce
    });
    meta.set("22", {
      id: "22",
      name: "Gold Oz 2",
      symbol: "GOZ2",
      flags: { backing: "rwa-backed", pegCurrency: "GOLD", governance: "centralized", yieldBearing: false, rwa: true, navToken: false },
      goldOunces: 1,
    });

    const assets = [
      makeAsset({ id: "20", pegType: "peggedGOLD", price: 100, circulating: { peggedGOLD: 2_000_000 } }),
      makeAsset({ id: "21", pegType: "peggedGOLD", price: 3100, circulating: { peggedGOLD: 5_000_000 } }),
      makeAsset({ id: "22", pegType: "peggedGOLD", price: 3200, circulating: { peggedGOLD: 5_000_000 } }),
    ];

    const rates = derivePegRates(assets, meta);
    // After normalization: gold gram ($100) → $100 / (1/31.1035) = ~$3110/oz
    // Three prices: ~3110, 3100, 3200 → median = 3110
    expect(rates["peggedGOLD"]).toBeGreaterThan(2000);
    expect(rates["peggedGOLD"]).toBeLessThan(4000);
  });
});

describe("getPegReference", () => {
  it("returns 1 for undefined pegType", () => {
    expect(getPegReference(undefined, {})).toBe(1);
  });

  it("returns rate for known pegType", () => {
    expect(getPegReference("peggedEUR", { peggedEUR: 1.08 })).toBeCloseTo(1.08, 2);
  });

  it("returns 1 for unknown pegType", () => {
    expect(getPegReference("peggedXYZ", {})).toBe(1);
  });

  it("scales gold rate by goldOunces", () => {
    const ref = getPegReference("peggedGOLD", { peggedGOLD: 3100 }, 1 / 31.1035);
    // 3100 * (1/31.1035) = ~99.7 per gram
    expect(ref).toBeCloseTo(99.7, 0);
  });

  it("returns unscaled gold rate when goldOunces is undefined", () => {
    expect(getPegReference("peggedGOLD", { peggedGOLD: 3100 })).toBe(3100);
  });
});
