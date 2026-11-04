import { describe, expect, it } from "vitest";
import { parseTxlist } from "../../cron/sync-clear-v1-gas";

const W = "0xbc9d0f94ffc516f9b5e87a8480156b8d12332b43";
const tx = (o: object) => ({
  hash: "0x1", from: W, to: "0x2", blockNumber: "10", timeStamp: "1762000000",
  gasUsed: "400000", gasPrice: "1000000000", value: "0", isError: "0", ...o,
});

describe("parseTxlist", () => {
  it("treats No transactions found as empty", () => {
    expect(parseTxlist({ status: "0", message: "No transactions found", result: [] }, W)).toEqual([]);
  });
  it("throws on NOTOK", () => {
    expect(() => parseTxlist({ status: "0", message: "NOTOK", result: "rate limit" }, W)).toThrow(/NOTOK/);
  });
  it("excludes incoming top-ups", () => {
    const r = parseTxlist({ status: "1", message: "OK", result: [tx({ from: "0xfeed" })] }, W);
    expect(r).toEqual([]);
  });
  it("computes cost and keeps failed txs", () => {
    const [r] = parseTxlist({ status: "1", message: "OK", result: [tx({ isError: "1" })] }, W);
    expect(r.failed).toBe(1);
    expect(r.gas_cost_eth).toBeCloseTo(0.0004, 8);
    expect(r.gas_price_gwei).toBe(1);
  });
});
