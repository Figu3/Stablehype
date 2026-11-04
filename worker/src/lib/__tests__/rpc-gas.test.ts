import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEthPriceChainlink, rpcGetNonceAt, rpcGetReceiptStrict } from "../rpc";

const stubResult = (result: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ result }) })));

const word = (n: bigint) => n.toString(16).padStart(64, "0");
const round = (answer: bigint, updatedAt: number) =>
  "0x" + word(1n) + word(answer) + word(BigInt(updatedAt)) + word(BigInt(updatedAt)) + word(1n);

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("fetchEthPriceChainlink", () => {
  const now = 1_800_000_000;
  it("reads the answer at 8 decimals", async () => {
    vi.useFakeTimers({ now: now * 1000 });
    stubResult(round(241921473537n, now - 60));
    expect(await fetchEthPriceChainlink("url")).toBeCloseTo(2419.21473537, 6);
  });
  it("throws on a stale round", async () => {
    vi.useFakeTimers({ now: now * 1000 });
    stubResult(round(241921473537n, now - 3 * 3600));
    await expect(fetchEthPriceChainlink("url")).rejects.toThrow(/stale/);
  });
  it("throws on a fault object returned with HTTP 200", async () => {
    stubResult({ fault: "upstream" });
    await expect(fetchEthPriceChainlink("url")).rejects.toThrow(/latestRoundData/);
  });
});

describe("rpcGetNonceAt", () => {
  it("parses hex", async () => {
    stubResult("0x39");
    expect(await rpcGetNonceAt("url", "0x1", 10)).toBe(57);
  });
  it("throws on a fault object returned with HTTP 200", async () => {
    stubResult({ fault: "upstream" });
    await expect(rpcGetNonceAt("url", "0x1", 10)).rejects.toThrow(/eth_getTransactionCount/);
  });
});

describe("rpcGetReceiptStrict", () => {
  it("reads a reverted receipt", async () => {
    stubResult({ gasUsed: "0x61a80", effectiveGasPrice: "0x3b9aca00", status: "0x0" });
    expect(await rpcGetReceiptStrict("url", "0x1")).toEqual({ gasUsed: 400000, effectiveGasPrice: 1e9, failed: true });
  });
  it("throws when the receipt is missing", async () => {
    stubResult(null);
    await expect(rpcGetReceiptStrict("url", "0x1")).rejects.toThrow(/receipt/);
  });
});
