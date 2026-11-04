import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getLastBlock: vi.fn(async () => 0), setLastBlock: vi.fn(async () => {}) }));
vi.mock("../rpc", () => ({
  fetchEthPriceChainlink: vi.fn(),
  rpcGetTipBlock: vi.fn(),
  rpcGetNonceAt: vi.fn(),
  rpcGetBlockWithTxs: vi.fn(),
  rpcGetReceiptStrict: vi.fn(),
}));

import { getLastBlock, setLastBlock } from "../db";
import {
  fetchEthPriceChainlink, rpcGetBlockWithTxs, rpcGetNonceAt, rpcGetReceiptStrict, rpcGetTipBlock,
} from "../rpc";
import { syncClearV1Gas } from "../../cron/sync-clear-v1-gas";
import { V1_GAS_WATCHLIST } from "@shared/lib/clear-v1-config";

const db = {
  prepare: () => ({ bind: (...a: unknown[]) => a }),
  batch: vi.fn(async () => []),
} as unknown as D1Database;

const START = 30_000_000;
const TIP = START + 112; // safe tip is START + 100
const TX_BLOCK = START + 50;

// Each watched wallet sends one tx in TX_BLOCK. `txsInBlock` lets a test hide it.
const stubChain = (txsInBlock = 1) => {
  vi.mocked(getLastBlock).mockResolvedValue(START);
  vi.mocked(fetchEthPriceChainlink).mockResolvedValue(3000);
  vi.mocked(rpcGetTipBlock).mockResolvedValue(TIP);
  vi.mocked(rpcGetNonceAt).mockImplementation(async (_u, _w, block) => (block >= TX_BLOCK ? 1 : 0));
  vi.mocked(rpcGetBlockWithTxs).mockImplementation(async () => ({
    timestamp: 1762000000,
    transactions: V1_GAS_WATCHLIST.slice(0, txsInBlock === 1 ? undefined : 0).map((w) => ({
      hash: `0x${w.address.slice(2, 10)}`, from: w.address, to: "0x2", value: "0x0",
    })),
  }));
  vi.mocked(rpcGetReceiptStrict).mockResolvedValue({ gasUsed: 400000, effectiveGasPrice: 1e9, failed: false });
};

beforeEach(() => vi.clearAllMocks());

describe("syncClearV1Gas", () => {
  it("throws when the RPC URL is missing", async () => {
    await expect(syncClearV1Gas(db, null)).rejects.toThrow(/ROUTEMESH_RPC_URL/);
  });
  it("throws before inserting and keeps the cursor when the ETH price is unavailable", async () => {
    stubChain();
    vi.mocked(fetchEthPriceChainlink).mockRejectedValue(new Error("feed down"));
    await expect(syncClearV1Gas(db, "url")).rejects.toThrow(/feed down/);
    expect(db.batch).not.toHaveBeenCalled();
    expect(setLastBlock).not.toHaveBeenCalled();
  });
  it("inserts and moves the cursor to the safe tip", async () => {
    stubChain();
    await syncClearV1Gas(db, "url");
    expect(db.batch).toHaveBeenCalledTimes(V1_GAS_WATCHLIST.length);
    expect(setLastBlock).toHaveBeenCalledWith(db, `clear-v1-gas:${V1_GAS_WATCHLIST[0].address}`, START + 100);
  });
  it("throws and keeps the cursor when a block holds fewer txs than the nonce moved", async () => {
    stubChain(0);
    await expect(syncClearV1Gas(db, "url")).rejects.toThrow(/expected 1/);
    expect(db.batch).not.toHaveBeenCalled();
    expect(setLastBlock).not.toHaveBeenCalled();
  });
  it("throws when the nonce went backwards", async () => {
    stubChain();
    vi.mocked(rpcGetNonceAt).mockImplementation(async (_u, _w, block) => (block === START ? 5 : 1));
    await expect(syncClearV1Gas(db, "url")).rejects.toThrow(/nonce/);
    expect(setLastBlock).not.toHaveBeenCalled();
  });
});
