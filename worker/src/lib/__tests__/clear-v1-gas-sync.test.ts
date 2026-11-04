import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getLastBlock: vi.fn(async () => 0), setLastBlock: vi.fn(async () => {}) }));
vi.mock("../rpc", () => ({ fetchEthPrice: vi.fn() }));

import { setLastBlock } from "../db";
import { fetchEthPrice } from "../rpc";
import { syncClearV1Gas } from "../../cron/sync-clear-v1-gas";

const db = {
  prepare: () => ({ bind: (...a: unknown[]) => a }),
  batch: vi.fn(async () => []),
} as unknown as D1Database;

// Etherscan stub: one outgoing tx per watched wallet.
const stubEtherscan = () =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const wallet = new URL(url).searchParams.get("address")!;
    return {
      ok: true,
      json: async () => ({
        status: "1", message: "OK",
        result: [{
          hash: `0x${wallet.slice(2, 10)}`, from: wallet, to: "0x2", blockNumber: "30000000",
          timeStamp: "1762000000", gasUsed: "400000", gasPrice: "1000000000", value: "0", isError: "0",
        }],
      }),
    };
  }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("syncClearV1Gas", () => {
  it("throws before inserting and keeps the cursor when the ETH price is unavailable", async () => {
    stubEtherscan();
    vi.mocked(fetchEthPrice).mockResolvedValue(null);
    await expect(syncClearV1Gas(db, "key")).rejects.toThrow(/ETH price unavailable/);
    expect(db.batch).not.toHaveBeenCalled();
    expect(setLastBlock).not.toHaveBeenCalled();
  });
  it("inserts and advances the cursor when the price is known", async () => {
    stubEtherscan();
    vi.mocked(fetchEthPrice).mockResolvedValue(3000);
    await syncClearV1Gas(db, "key");
    expect(db.batch).toHaveBeenCalled();
    expect(setLastBlock).toHaveBeenCalled();
  });
});
