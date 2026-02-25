import { describe, it, expect } from "vitest";
import {
  TIER_META,
  TIER_ORDER,
  STABLECOIN_TIERS,
  STABLECOIN_TIER_SCORES,
  getStablecoinTier,
  getStablecoinTierScore,
  type TierLevel,
} from "../tiers";

const ALL_TIERS: TierLevel[] = ["T1", "T2", "T3", "T4", "T5"];

describe("TIER_META", () => {
  it("defines all 5 tier levels", () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_META[tier]).toBeDefined();
    }
  });

  it("each tier has required display fields", () => {
    for (const tier of ALL_TIERS) {
      const meta = TIER_META[tier];
      expect(meta.level).toBe(tier);
      expect(meta.label).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.dotClass).toBeTruthy();
      expect(meta.bgClass).toBeTruthy();
      expect(meta.textClass).toBeTruthy();
      expect(meta.borderClass).toBeTruthy();
    }
  });
});

describe("TIER_ORDER", () => {
  it("T1 has highest order, T5 lowest", () => {
    expect(TIER_ORDER["T1"]).toBeGreaterThan(TIER_ORDER["T2"]);
    expect(TIER_ORDER["T2"]).toBeGreaterThan(TIER_ORDER["T3"]);
    expect(TIER_ORDER["T3"]).toBeGreaterThan(TIER_ORDER["T4"]);
    expect(TIER_ORDER["T4"]).toBeGreaterThan(TIER_ORDER["T5"]);
  });
});

describe("STABLECOIN_TIERS", () => {
  it("all tier values are valid TierLevel strings", () => {
    for (const [id, tier] of Object.entries(STABLECOIN_TIERS)) {
      expect(ALL_TIERS).toContain(tier);
    }
  });

  it("USDC (id=2) is T1", () => {
    expect(STABLECOIN_TIERS["2"]).toBe("T1");
  });

  it("USDT (id=1) is T1", () => {
    expect(STABLECOIN_TIERS["1"]).toBe("T1");
  });

  it("GHO (id=118) is T2", () => {
    expect(STABLECOIN_TIERS["118"]).toBe("T2");
  });

  it("USDe (id=146) is T3", () => {
    expect(STABLECOIN_TIERS["146"]).toBe("T3");
  });

  it("TUSD (id=4) is T5", () => {
    expect(STABLECOIN_TIERS["4"]).toBe("T5");
  });
});

describe("STABLECOIN_TIER_SCORES", () => {
  it("scored stablecoins have matching tier in STABLECOIN_TIERS", () => {
    for (const [id, assignment] of Object.entries(STABLECOIN_TIER_SCORES)) {
      expect(STABLECOIN_TIERS[id]).toBe(assignment.tier);
    }
  });

  it("each assignment has 8 dimensions", () => {
    for (const [id, assignment] of Object.entries(STABLECOIN_TIER_SCORES)) {
      expect(assignment.dimensions).toHaveLength(8);
    }
  });

  it("dimension scores are 0-3", () => {
    for (const assignment of Object.values(STABLECOIN_TIER_SCORES)) {
      for (const dim of assignment.dimensions) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(3);
      }
    }
  });

  it("dimension weights sum to 100", () => {
    for (const [id, assignment] of Object.entries(STABLECOIN_TIER_SCORES)) {
      const totalWeight = assignment.dimensions.reduce((sum, d) => sum + d.weight, 0);
      expect(totalWeight).toBe(100);
    }
  });
});

describe("getStablecoinTier", () => {
  it("returns correct tier for known ID", () => {
    expect(getStablecoinTier("2")).toBe("T1");
    expect(getStablecoinTier("118")).toBe("T2");
  });

  it("returns undefined for unknown ID", () => {
    expect(getStablecoinTier("99999")).toBeUndefined();
  });
});

describe("getStablecoinTierScore", () => {
  it("returns score data for scored stablecoin", () => {
    const score = getStablecoinTierScore("2"); // USDC
    expect(score).toBeDefined();
    expect(score!.tier).toBe("T1");
    expect(score!.score).toBeGreaterThan(0);
    expect(score!.dimensions).toHaveLength(8);
  });

  it("returns undefined for unscored stablecoin", () => {
    expect(getStablecoinTierScore("99999")).toBeUndefined();
  });
});
