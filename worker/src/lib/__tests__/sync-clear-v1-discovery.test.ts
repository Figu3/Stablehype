import { beforeEach, describe, expect, it, vi } from "vitest";
import fx from "./fixtures/clear-v1-new-reserve.json";

const store: Record<string, string> = {};
vi.mock("../db", () => ({
  getLastBlock: vi.fn(async () => 26_355_000),
  setLastBlock: vi.fn(async () => {}),
  getCache: vi.fn(async (_db: unknown, k: string) => (k in store ? { value: store[k], updatedAt: 0 } : null)),
  setCache: vi.fn(async (_db: unknown, k: string, v: string) => { store[k] = v; }),
}));
vi.mock("../rpc", () => ({
  rpcGetTipBlock: vi.fn(async () => 26_360_012),
  rpcGetLogsMulti: vi.fn(),
  rpcGetTxStrict: vi.fn(async () => ({ from: "0xfrom", to: "0xto" })),
  rpcGetBlockTimestampStrict: vi.fn(async () => 1_793_968_000),
  rpcEthCall: vi.fn(),
}));
vi.mock("../clear-v1-registry", async (orig) => {
  const real = await orig<typeof import("../clear-v1-registry")>();
  return { ...real, pollCurvePools: vi.fn() };
});

import { setCache, setLastBlock } from "../db";
import { rpcEthCall, rpcGetLogsMulti } from "../rpc";
import { pollCurvePools, REGISTRY_CACHE_KEY } from "../clear-v1-registry";
import { V1_STATIC, type Discovered, type V1Base } from "@shared/lib/clear-v1-config";
import { syncClearV1Events } from "../../cron/sync-clear-v1-events";

const META_GHO = "0x15954f33c25828156f8d8f1de564e1e48889197f";
const IOU_GHO = "0xe10eebaacddf81d1bd92a7c38e7555f94107742d";
const IOU_BLP_GHO = "0x4ada21212a165ac805b7bae7bbd80f03be824771";
const GHO = "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f";
const CLR_USD = "0xb9ca6ea808f54576ae6350c266469e35e099ea6d";
const GHO_POOL = "0x345fcdcd4f5f125f8acdb3241916025f05079a7a";
const ghoAddrs = [META_GHO, IOU_GHO, IOU_BLP_GHO, GHO, GHO_POOL,
  "0xd60cc1154b937b85d70cbf88f913f36d67030540", "0x87512e62f635e8c6887ce371f9aec387105ed3bf"];
const PRE_GHO: V1Base = {
  reserves: V1_STATIC.reserves.filter((r) => !ghoAddrs.includes(r.address)),
  tokens: Object.fromEntries(Object.entries(V1_STATIC.tokens).filter(([a]) => !ghoAddrs.includes(a))),
  pools: V1_STATIC.pools.filter((p) => !ghoAddrs.includes(p.address)),
  feeds: V1_STATIC.feeds.filter((f) => f !== GHO),
};

const CALLS: Record<string, string> = {
  // nativeIou(), baseLpIou(), symbol(), decimals() selectors, abi-encoded mainnet answers.
  [`${META_GHO}:0xd73bd167`]: "0x000000000000000000000000e10eebaacddf81d1bd92a7c38e7555f94107742d",
  [`${META_GHO}:0x57e5a13e`]: "0x0000000000000000000000004ada21212a165ac805b7bae7bbd80f03be824771",
};

const db = { prepare: () => ({ bind: (...a: unknown[]) => a }), batch: vi.fn(async () => []) } as unknown as D1Database;
const saved = () => JSON.parse(store[REGISTRY_CACHE_KEY]) as Discovered;
const scans = () => vi.mocked(rpcGetLogsMulti).mock.calls.map(([, a, f, t]) => ({ a: [...a].sort(), f, t }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(store)) delete store[k];
  vi.mocked(pollCurvePools).mockImplementation(async (_u, curve, _k, head) => ({ count: curve?.count ?? 12, polledAt: head, unmatched: curve?.unmatched ?? [] }));
});

describe("syncClearV1Events discovery", () => {
  it("discovers Meta GHO from its factory log and scans its emitters from the creation block in the same tick", async () => {
    vi.mocked(rpcGetLogsMulti).mockImplementation(async (_u, addrs) =>
      addrs.includes("0x2b2a51bbf9d3794490b9edda1b2b46d5aefd0a95") ? [fx.newReserveGho as never] : []);
    vi.mocked(rpcEthCall).mockImplementation(async (_u, to, data) => {
      const key = `${to.toLowerCase()}:${data.slice(0, 10)}`;
      if (CALLS[key]) return CALLS[key];
      const { encodeFunctionResult, parseAbi } = await import("viem");
      const abi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
      const sym: Record<string, string> = { [GHO]: "GHO", [IOU_GHO]: "iouGHO", [IOU_BLP_GHO]: "ioubLP" };
      if (data.startsWith("0x95d89b41")) return encodeFunctionResult({ abi, functionName: "symbol", result: sym[to.toLowerCase()] });
      if (data.startsWith("0x313ce567")) return encodeFunctionResult({ abi, functionName: "decimals", result: 18 });
      throw new Error(`unexpected call ${key}`);
    });

    await syncClearV1Events(db, "u", PRE_GHO);

    expect(scans()).toContainEqual({ a: [META_GHO, IOU_GHO, IOU_BLP_GHO].sort(), f: 26_355_428, t: 26_360_000 });
    const d = saved();
    expect(d.reserves.map((r) => r.address)).toEqual([META_GHO]);
    expect(d.tokens[IOU_BLP_GHO]).toEqual({ symbol: "ioubLP (GHO)", decimals: 18 });
    expect(d.backfill).toEqual([]); // nothing of a reserve can predate its creation log
    const saveOrder = vi.mocked(setCache).mock.invocationCallOrder.at(-1)!;
    expect(saveOrder).toBeLessThan(vi.mocked(setLastBlock).mock.invocationCallOrder[0]);
  });

  it("queues a backfill for a pool whose lower bound predates the scan, and drains it one chunk per tick", async () => {
    vi.mocked(rpcGetLogsMulti).mockResolvedValue([]);
    store[REGISTRY_CACHE_KEY] = JSON.stringify({
      reserves: [], tokens: { [GHO]: { symbol: "GHO", decimals: 18 } }, pools: [], feeds: [], backfill: [],
      curve: { count: 15, polledAt: 26_354_000, unmatched: [{ address: GHO_POOL, coins: [GHO, CLR_USD], notBefore: 26_344_000 }] },
    } satisfies Discovered);

    await syncClearV1Events(db, "u", PRE_GHO);
    expect(scans()).toContainEqual({ a: [GHO_POOL], f: 26_355_001, t: 26_360_000 });
    expect(saved().pools.map((p) => p.label)).toEqual(["GHO / clrUSD"]);
    // The tick also drains the first chunk of the new job (26,344,000 .. 26,348,999).
    expect(scans()).toContainEqual({ a: [GHO_POOL], f: 26_344_000, t: 26_348_999 });
    expect(saved().backfill).toEqual([{ addresses: [GHO_POOL], from: 26_349_000, to: 26_355_000 }]);

    vi.mocked(rpcGetLogsMulti).mockClear();
    await syncClearV1Events(db, "u", PRE_GHO);
    expect(scans()).toContainEqual({ a: [GHO_POOL], f: 26_349_000, t: 26_353_999 });
    vi.mocked(rpcGetLogsMulti).mockClear();
    await syncClearV1Events(db, "u", PRE_GHO);
    expect(scans()).toContainEqual({ a: [GHO_POOL], f: 26_354_000, t: 26_355_000 });
    expect(saved().backfill).toEqual([]);
  });

  it("does not save discoveries or move the cursor when the follow-up scan fails", async () => {
    store[REGISTRY_CACHE_KEY] = JSON.stringify({
      reserves: [], tokens: { [GHO]: { symbol: "GHO", decimals: 18 } }, pools: [], feeds: [], backfill: [],
      curve: { count: 15, polledAt: 26_354_000, unmatched: [{ address: GHO_POOL, coins: [GHO, CLR_USD], notBefore: 26_356_000 }] },
    } satisfies Discovered);
    const before = store[REGISTRY_CACHE_KEY];
    vi.mocked(rpcGetLogsMulti).mockImplementation(async (_u, addrs) => {
      if (addrs.length === 1 && addrs[0] === GHO_POOL) throw new Error("boom");
      return [];
    });
    await expect(syncClearV1Events(db, "u", PRE_GHO)).rejects.toThrow("boom");
    expect(store[REGISTRY_CACHE_KEY]).toBe(before);
    expect(setLastBlock).not.toHaveBeenCalled();
  });
});
