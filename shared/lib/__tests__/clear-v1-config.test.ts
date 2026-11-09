import { describe, expect, it } from "vitest";
import { V1_EMITTERS, V1_POOLS, V1_RESERVES, V1_TOKENS } from "../clear-v1-config";

describe("clear v1 config", () => {
  it("lists 37 unique lowercase emitters", () => {
    expect(V1_EMITTERS).toHaveLength(37);
    expect(new Set(V1_EMITTERS).size).toBe(37);
    for (const a of V1_EMITTERS) expect(a).toBe(a.toLowerCase());
  });
  it("knows decimals for every pool coin", () => {
    for (const p of V1_POOLS) for (const c of p.coins) expect(V1_TOKENS[c]).toBeDefined();
  });
  it("has one base and three meta reserves", () => {
    expect(V1_RESERVES.filter((r) => r.kind === "base")).toHaveLength(1);
    expect(V1_RESERVES.filter((r) => r.kind === "meta")).toHaveLength(4);
  });
  it("gives every reserve swap legs that are known tokens", () => {
    for (const r of V1_RESERVES) {
      expect(r.legs.length).toBeGreaterThanOrEqual(2);
      for (const l of r.legs) expect(V1_TOKENS[l]).toBeDefined();
    }
  });
});
