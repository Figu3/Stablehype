import { describe, expect, it } from "vitest";
import { computeBurnPerHour, computeLpApr, computeRevenue, computeRunway, computeTvl, computeVolume, percentile, priceOn, type MetricEvent } from "../clear-v1-metrics";

const BLP = "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

const ev = (o: Partial<MetricEvent>): MetricEvent => ({
  tx_hash: "0x1", date: "2026-11-04", contract: BLP, kind: "swap",
  token_in: null, token_out: null, amount_in_raw: null, amount_out_raw: null,
  volume_token: USDC, volume_units: 0,
  fee_token: USDC, fee_treasury_units: null, fee_lp_units: null, fee_trader_units: null, ...o,
});

describe("computeTvl", () => {
  it("reproduces the live example and does not double count bLP", () => {
    const t = computeTvl([
      { kind: "base", grossPar: 6249, nativeValue: null, iouDebtPar: 249 },
      { kind: "meta", grossPar: 1678.92, nativeValue: 553.43, iouDebtPar: 249.1 },
      { kind: "meta", grossPar: 1678.92, nativeValue: 553.43, iouDebtPar: 249.1 },
      { kind: "meta", grossPar: 1678.92, nativeValue: 553.44, iouDebtPar: 249.09 },
    ]);
    expect(t.grossTvl).toBeCloseTo(7909.3, 1);
    expect(t.iouDebt).toBeCloseTo(996.29, 1);
    expect(t.netTvl).toBeCloseTo(6913.01, 1);
    expect(t.partial).toBe(false);
  });
  it("returns null, not a wrong number, when a leg is unavailable", () => {
    const t = computeTvl([
      { kind: "base", grossPar: 6249, nativeValue: null, iouDebtPar: 249 },
      { kind: "meta", grossPar: null, nativeValue: null, iouDebtPar: null },
    ]);
    expect(t.grossTvl).toBeNull();
    expect(t.partial).toBe(true);
  });
});

describe("priceOn", () => {
  const prices = new Map([["2026-11-01", 1.0005], ["2026-11-03", 1.0008]]);
  it("prices stables at par", () => expect(priceOn(USDC, "2026-11-04", prices)).toBe(1));
  it("uses the exact date", () => expect(priceOn(BLP, "2026-11-03", prices)).toBe(1.0008));
  it("falls back to the latest earlier date", () => expect(priceOn(BLP, "2026-11-02", prices)).toBe(1.0005));
  it("uses par when no snapshot exists", () => expect(priceOn(BLP, "2026-11-04", new Map())).toBe(1));
});

describe("computeVolume", () => {
  it("counts a routed two-leg swap once, and twice per reserve leg", () => {
    const v = computeVolume([
      ev({ tx_hash: "0xa", volume_units: 100 }),
      ev({ tx_hash: "0xa", volume_units: 99 }),
      ev({ tx_hash: "0xb", volume_units: 50 }),
    ], new Map());
    expect(v.swapVolume).toBe(150);
    expect(v.reserveLegVolume).toBe(249);
  });
});

describe("computeRevenue", () => {
  it("routes each fee to its line", () => {
    const r = computeRevenue([
      ev({ fee_treasury_units: 1, fee_lp_units: 2, fee_trader_units: 3 }),
      ev({ kind: "flash_loan", fee_lp_units: 4 }),
      ev({ kind: "deposit", fee_treasury_units: 5 }),
    ], new Map());
    expect(r.swapTreasury).toBe(1);
    expect(r.swapLp).toBe(2);
    expect(r.traderRebate).toBe(3);
    expect(r.flashLp).toBe(4);
    expect(r.singleAssetTreasury).toBe(5);
    expect(r.total).toBe(12);
  });
  it("prices a bLP fee as bLP", () => {
    const r = computeRevenue([ev({ fee_token: BLP, fee_treasury_units: 100 })], new Map([["2026-11-04", 1.001]]));
    expect(r.swapTreasury).toBeCloseTo(100.1, 6);
  });
  it("counts rebalance result on Base only", () => {
    const base = ev({ kind: "rebalance", token_in: USDC, token_out: USDT, amount_in_raw: "1000000", amount_out_raw: "999000" });
    const meta = ev({ ...base, contract: "0x4ff500233d1898ae2ac5ad61296780ba35dcaed4" });
    expect(computeRevenue([base, meta], new Map()).rebalanceResult).toBeCloseTo(0.001, 6);
  });
});

describe("percentile", () => {
  it("is null with no data", () => expect(percentile([], 0.95)).toBeNull());
  it("picks the high end", () => expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10));
});

describe("computeRunway", () => {
  it("needs 3 days of data", () => expect(computeRunway(1, 0.1, 2)).toBeNull());
  it("divides balance by daily spend", () => expect(computeRunway(1, 0.1, 7)).toBe(10));
  it("is null with no spend", () => expect(computeRunway(1, 0, 7)).toBeNull());
});

describe("computeBurnPerHour", () => {
  const NOW = 1_800_000_000;
  const HOUR = 3600;
  const ago = (hours: number, eth: number) => ({ ts: NOW - hours * HOUR, eth });

  it("is zero with no tx", () => expect(computeBurnPerHour([], NOW)).toBe(0));
  it("does not need 3 days of data", () => {
    expect(computeBurnPerHour([ago(2, 0.24)], NOW)).toBeCloseTo(0.01, 10);
  });
  it("spreads a young wallet's spend over 24h at least, so one fresh tx is not a huge rate", () => {
    expect(computeBurnPerHour([ago(0.1, 0.024)], NOW)).toBeCloseTo(0.001, 10);
  });
  it("takes the 24h rate when a burst is running above the 7 day rate", () => {
    const txs = [ago(167, 0.0168), ago(1, 0.24)];
    expect(computeBurnPerHour(txs, NOW)).toBeCloseTo(0.01, 10);
  });
  it("keeps the 7 day rate through a planned stop, so a quiet day is not an endless runway", () => {
    const txs = [ago(168, 0), ago(100, 0.168)];
    expect(computeBurnPerHour(txs, NOW)).toBeCloseTo(0.001, 10);
  });
  it("counts a young wallet's 7 day rate over its real age", () => {
    const txs = [ago(48, 0.48)];
    expect(computeBurnPerHour(txs, NOW)).toBeCloseTo(0.01, 10);
  });
  it("ignores txs older than 7 days", () => {
    expect(computeBurnPerHour([ago(169, 5)], NOW)).toBe(0);
  });
});

describe("computeLpApr", () => {
  it("annualises fees over the average net value of the days covered", () => {
    // $7 over 7 days on $36,500 average: $365 a year, 1%.
    expect(computeLpApr(7, [20_000, 20_000, 20_000, 40_000, 51_833, 51_833, 51_834])).toBeCloseTo(1, 6);
  });
  it("is zero, not unknown, when a funded reserve earned nothing", () => {
    expect(computeLpApr(0, [100, 100, 100])).toBe(0);
  });
  it("is unknown under three days of history or with no capital", () => {
    expect(computeLpApr(5, [100, 100])).toBeNull();
    expect(computeLpApr(5, [0, 0, 0])).toBeNull();
  });
});
