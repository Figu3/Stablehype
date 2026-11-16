import { describe, expect, it } from "vitest";
import { rebalanceFlows, rebalanceGains, type RebalanceRow } from "../seve-rebalances";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const BLP = "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d";
const decimals: Record<string, number> = { [USDC]: 6, [USDT]: 6, [BLP]: 18 };
const dec = (t: string) => decimals[t];
const isLp = (t: string) => t === BLP;

const row = (inRaw: string, outRaw: string, tokenIn = USDC, tokenOut = USDT): RebalanceRow => ({
  tx_hash: "0x1", timestamp: 1, contract: BLP, actor: null,
  token_in: tokenIn, token_out: tokenOut, amount_in_raw: inRaw, amount_out_raw: outRaw,
});

describe("rebalanceGains", () => {
  it("pays 1 / 0.9992 USDT per USDC: about 8 bps gross, 7 bps net of a 1 bp redemption", () => {
    // 10,000 USDC in, 10,000 / 0.9992 = 10,008.006405 USDT out.
    const g = rebalanceGains([row("10000000000", "10008006405")], dec, isLp, 1);
    expect(g.rows[0].grossUsd).toBeCloseTo(8.006405, 6);
    expect(g.grossBps).toBeCloseTo(8.006, 3);
    expect(g.netBps).toBeCloseTo(7.006, 2);
    expect(g.netUsd).toBeCloseTo(8.006405 - 1.0008006405, 6);
  });

  it("leaves a rebalance with a bLP leg unpriced and out of the totals", () => {
    const g = rebalanceGains(
      [row("10000000000", "10008006405"), row("5000000000", "4990000000000000000000", USDC, BLP)],
      dec, isLp,
    );
    expect(g.count).toBe(2);
    expect(g.pricedCount).toBe(1);
    expect(g.rows[1].grossUsd).toBeNull();
    expect(g.volumeUsd).toBeCloseTo(10_000, 6);
  });

  it("skips a row whose token decimals are unknown and gives no bps without priced volume", () => {
    const g = rebalanceGains([row("1", "1", "0xunknown", USDT)], dec, isLp);
    expect(g.count).toBe(0);
    expect(g.grossBps).toBeNull();
  });
});

describe("rebalanceFlows", () => {
  const NOW = 100 * 86_400;
  const at = (daysAgo: number, r: RebalanceRow): RebalanceRow => ({ ...r, timestamp: NOW - daysAgo * 86_400 });

  it("counts the received leg as redeemed and the supplied leg as minted, per window", () => {
    const g = rebalanceGains([
      at(0.5, row("10000000000", "10008000000")),
      at(3, row("20000000000", "20016000000")),
      at(60, row("5000000000", "5004000000")),
      at(95, row("1000000000", "1000800000")),
    ], dec, isLp);
    const flows = rebalanceFlows(g.rows, isLp, NOW);
    const usdt = flows.find((f) => f.token === USDT)!;
    const usdc = flows.find((f) => f.token === USDC)!;
    expect(usdt.redeemed).toEqual({ "24h": 10_008, "7d": 30_024, "30d": 30_024, "90d": 35_028 });
    expect(usdc.minted).toEqual({ "24h": 10_000, "7d": 30_000, "30d": 30_000, "90d": 35_000 });
    expect(usdt.minted["90d"]).toBe(0);
    expect(usdc.redeemed["90d"]).toBe(0);
  });

  it("ignores a bLP leg: a reserve share is neither redeemed nor minted", () => {
    const g = rebalanceGains([at(1, row("5000000000000000000000", "5001000000", BLP, USDT))], dec, isLp);
    const flows = rebalanceFlows(g.rows, isLp, NOW);
    expect(flows.map((f) => f.token)).toEqual([USDT]);
    expect(flows[0].redeemed["7d"]).toBeCloseTo(5_001, 6);
  });
});
