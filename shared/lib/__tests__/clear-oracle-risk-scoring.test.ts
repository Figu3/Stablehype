import { describe, expect, it } from "vitest";
import {
  scoreClearOracleDependencyRisk,
  scoreAllClearOracleConfigs,
  scoreToGrade,
} from "../clear-oracle-risk-scoring";
import { CLEAR_ORACLE_RISK_CONFIGS } from "../clear-oracle-risk-config";
import type { ClearOracleRiskConfig } from "../clear-oracle-risk-types";

const EMPTY = new Map<string, number>();

describe("scoreClearOracleDependencyRisk", () => {
  it("returns the self-backed score when there are no dependencies", () => {
    const config: ClearOracleRiskConfig = {
      id: "test-self",
      governance: "decentralized",
      dependencies: [],
    };
    const entry = scoreClearOracleDependencyRisk(config, EMPTY);
    expect(entry.score).toBe(90);
    expect(entry.grade).toBe("A");
    expect(entry.resolvedDeps).toHaveLength(0);
    expect(entry.detail).toMatch(/Self-backed: Decentralized \(90\)/);
  });

  it("blends sentinel deps with the self-backed score and applies the weak-dep penalty", () => {
    // USDT-shaped: offchain-issuer (70) 0.6 + fiat-banks (60) 0.3, centralized (95).
    // Blended ~= 0.6*70 + 0.3*60 + 0.1*95 = 42 + 18 + 9.5 = 69.5; weak-dep penalty -10 = ~60.
    const config: ClearOracleRiskConfig = {
      id: "test-usdt",
      governance: "centralized",
      dependencies: [
        { upstreamId: "offchain-issuer", label: "issuer", weight: 0.6, type: "custody" },
        { upstreamId: "fiat-banks", label: "banks", weight: 0.3, type: "custody" },
      ],
    };
    const entry = scoreClearOracleDependencyRisk(config, EMPTY);
    expect(entry.score).toBe(60);
    expect(entry.resolvedDeps).toHaveLength(2);
    expect(entry.detail).toMatch(/2 weak deps below 75/);
  });

  it("applies the mechanism ceiling when an internal-id dep is weak", () => {
    // GHO-shaped: USDC mechanism dep at score 60, decentralized self (90).
    // Blended = 0.4*60 + 0.6*90 = 24 + 54 = 78; weak-dep -10 = 68; mechanism ceiling = 60.
    const config: ClearOracleRiskConfig = {
      id: "test-gho-weak",
      governance: "decentralized",
      dependencies: [
        { upstreamId: "2", label: "USDC GSM", weight: 0.4, type: "mechanism" },
      ],
    };
    const upstream = new Map([["2", 60]]);
    const entry = scoreClearOracleDependencyRisk(config, upstream);
    expect(entry.score).toBe(60);
    expect(entry.detail).toMatch(/mechanism dependency ceiling/);
    expect(entry.detail).toMatch(/1 weak dep below 75/);
  });

  it("does not apply the weak-dep penalty when the internal upstream is healthy", () => {
    // GHO-shaped with USDC at 88 (>= 75): blend = 0.4*88 + 0.6*90 = 35.2 + 54 = 89.2,
    // mechanism ceiling = 88, no weak-dep penalty → final 88.
    const config: ClearOracleRiskConfig = {
      id: "test-gho-healthy",
      governance: "decentralized",
      dependencies: [
        { upstreamId: "2", label: "USDC GSM", weight: 0.4, type: "mechanism" },
      ],
    };
    const upstream = new Map([["2", 88]]);
    const entry = scoreClearOracleDependencyRisk(config, upstream);
    expect(entry.score).toBe(88);
    expect(entry.detail).not.toMatch(/Penalty/);
    expect(entry.detail).toMatch(/mechanism dependency ceiling \(88\)/);
  });

  it("applies a wrapper ceiling with the wrapper penalty", () => {
    // Wrapper at 80 → ceiling = 77; blend = 0.5*80 + 0.5*90 = 85; final = min(85, 77) = 77.
    const config: ClearOracleRiskConfig = {
      id: "test-wrapper",
      governance: "decentralized",
      dependencies: [
        { upstreamId: "2", label: "USDC wrap", weight: 0.5, type: "wrapper" },
      ],
    };
    const upstream = new Map([["2", 80]]);
    const entry = scoreClearOracleDependencyRisk(config, upstream);
    expect(entry.score).toBe(77);
    expect(entry.detail).toMatch(/wrapper dependency ceiling \(77\)/);
  });

  it("falls back to 70 when no upstream score can be resolved", () => {
    const config: ClearOracleRiskConfig = {
      id: "test-missing",
      governance: "decentralized",
      dependencies: [
        { upstreamId: "9999", label: "unknown", weight: 0.5, type: "collateral" },
      ],
    };
    const entry = scoreClearOracleDependencyRisk(config, EMPTY);
    expect(entry.score).toBe(70);
    expect(entry.detail).toBe("Upstream dependency scores unavailable");
    expect(entry.resolvedDeps).toHaveLength(0);
  });
});

describe("scoreAllClearOracleConfigs (real configs)", () => {
  it("produces a finite integer score and a valid grade for each of the 6 configs", () => {
    const result = scoreAllClearOracleConfigs(CLEAR_ORACLE_RISK_CONFIGS);
    const ids = Object.keys(CLEAR_ORACLE_RISK_CONFIGS);
    expect(Object.keys(result).sort()).toEqual(ids.sort());
    for (const id of ids) {
      const entry = result[id];
      expect(entry).toBeDefined();
      expect(Number.isInteger(entry.score)).toBe(true);
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(100);
      expect(scoreToGrade(entry.score)).toBe(entry.grade);
    }
  });

  it("scores GHO and USDS using the bootstrapped USDC score (mechanism ceiling)", () => {
    const result = scoreAllClearOracleConfigs(CLEAR_ORACLE_RISK_CONFIGS);
    const usdc = result["2"];
    const gho = result["118"];
    const usds = result["209"];
    expect(usdc).toBeDefined();
    expect(gho).toBeDefined();
    expect(usds).toBeDefined();
    // Both GHO and USDS use a USDC mechanism dep, so neither can exceed USDC.
    expect(gho.score).toBeLessThanOrEqual(usdc.score);
    expect(usds.score).toBeLessThanOrEqual(usdc.score);
  });
});

describe("scoreToGrade", () => {
  it("maps boundary scores to expected grades", () => {
    expect(scoreToGrade(100)).toBe("A+");
    expect(scoreToGrade(95)).toBe("A+");
    expect(scoreToGrade(90)).toBe("A");
    expect(scoreToGrade(75)).toBe("B");
    expect(scoreToGrade(60)).toBe("C");
    expect(scoreToGrade(39)).toBe("F");
    expect(scoreToGrade(0)).toBe("F");
  });
});
