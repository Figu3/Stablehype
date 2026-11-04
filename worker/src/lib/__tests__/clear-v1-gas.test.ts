import { describe, expect, it, vi } from "vitest";
import { findNonceBlocks, toGasRow } from "../../cron/sync-clear-v1-gas";

// Nonce after each block, for a wallet that sent txs in the given blocks.
const nonceFrom = (txBlocks: number[]) => {
  const fn = vi.fn(async (block: number) => txBlocks.filter((b) => b <= block).length);
  return fn;
};

describe("findNonceBlocks", () => {
  it("finds every block with txs, in order, and how many each holds", async () => {
    const r = await findNonceBlocks(nonceFrom([103, 103, 150, 200]), 100, 0, 200, 4, 25);
    expect(r).toEqual([{ block: 103, txs: 2 }, { block: 150, txs: 1 }, { block: 200, txs: 1 }]);
  });
  it("makes no call when the nonce did not move", async () => {
    const nonceAt = nonceFrom([]);
    expect(await findNonceBlocks(nonceAt, 100, 7, 200, 7, 25)).toEqual([]);
    expect(nonceAt).not.toHaveBeenCalled();
  });
  it("stops at the limit on the earliest blocks, so a cursor can resume there", async () => {
    const r = await findNonceBlocks(nonceFrom([110, 120, 130]), 100, 0, 200, 3, 2);
    expect(r.map((b) => b.block)).toEqual([110, 120]);
  });
  it("throws when a nonce read is outside its bounds, as a stale node would give", async () => {
    await expect(findNonceBlocks(async () => 0, 100, 5, 200, 9, 25)).rejects.toThrow(/nonce/);
  });
});

describe("toGasRow", () => {
  const W = "0xbc9d0f94ffc516f9b5e87a8480156b8d12332b43";
  const tx = { hash: "0x1", from: W, to: "0x2", value: "0xde0b6b3a7640000" };
  const receipt = { gasUsed: 400000, effectiveGasPrice: 1e9, failed: false };

  it("computes cost and value", () => {
    const r = toGasRow(tx, receipt, 10, 1762000000);
    expect(r.gas_cost_eth).toBeCloseTo(0.0004, 8);
    expect(r.gas_price_gwei).toBe(1);
    expect(r.value_eth).toBe(1);
    expect(r.failed).toBe(0);
  });
  it("keeps reverted txs, which burn gas and emit no logs", () => {
    expect(toGasRow(tx, { ...receipt, failed: true }, 10, 1762000000).failed).toBe(1);
  });
  it("accepts a contract creation, which has no recipient", () => {
    expect(toGasRow({ ...tx, to: null }, receipt, 10, 1762000000).tx_to).toBe("");
  });
});
