import { beforeEach, describe, expect, it, vi } from "vitest";
import fx from "./fixtures/clear-v1-logs.json";

vi.mock("../db", () => ({ getLastBlock: vi.fn(async () => 26_300_000), setLastBlock: vi.fn(async () => {}) }));
vi.mock("../rpc", () => ({
  rpcGetTipBlock: vi.fn(async () => 26_400_000),
  rpcGetLogsMulti: vi.fn(),
  rpcGetTxStrict: vi.fn(),
  rpcGetBlockTimestampStrict: vi.fn(async () => 1_762_000_000),
}));

import { setLastBlock } from "../db";
import { rpcGetLogsMulti, rpcGetTxStrict } from "../rpc";
import { syncClearV1Events } from "../../cron/sync-clear-v1-events";

const db = {
  prepare: () => ({ bind: (...a: unknown[]) => a }),
  batch: vi.fn(async () => []),
} as unknown as D1Database;

beforeEach(() => vi.clearAllMocks());

describe("syncClearV1Events", () => {
  it("does not move the cursor when the log scan fails", async () => {
    vi.mocked(rpcGetLogsMulti).mockRejectedValue(new Error("boom"));
    await expect(syncClearV1Events(db, "u")).rejects.toThrow("boom");
    expect(setLastBlock).not.toHaveBeenCalled();
  });
  it("does not move the cursor when a tx read fails", async () => {
    vi.mocked(rpcGetLogsMulti).mockResolvedValue([fx.iou as never]);
    vi.mocked(rpcGetTxStrict).mockRejectedValue(new Error("no tx"));
    await expect(syncClearV1Events(db, "u")).rejects.toThrow("no tx");
    expect(setLastBlock).not.toHaveBeenCalled();
  });
  it("advances after an empty but successful scan", async () => {
    vi.mocked(rpcGetLogsMulti).mockResolvedValue([]);
    await syncClearV1Events(db, "u");
    expect(setLastBlock).toHaveBeenCalledWith(db, "clear-v1-events", 26_305_000);
  });
});
