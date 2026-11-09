import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionResult, decodeFunctionData, parseAbi, type Hex } from "viem";
import fx from "./fixtures/clear-v1-new-reserve.json";

vi.mock("../rpc", () => ({ rpcEthCall: vi.fn() }));

import { rpcEthCall } from "../rpc";
import {
  V1_STATIC, V1_CURVE_FACTORY, V1_DEPLOY_BLOCK, mergeRegistry, emptyDiscovered, type V1Base,
} from "@shared/lib/clear-v1-config";
import { discoverReserve, matchPools, parseNewReserve, pollCurvePools, POOL_NOT_BEFORE_MARGIN } from "../clear-v1-registry";

const GHO = "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f";
const META_GHO = "0x15954f33c25828156f8d8f1de564e1e48889197f";
const IOU_GHO = "0xe10eebaacddf81d1bd92a7c38e7555f94107742d";
const IOU_BLP_GHO = "0x4ada21212a165ac805b7bae7bbd80f03be824771";
const CLR_USD = "0xb9ca6ea808f54576ae6350c266469e35e099ea6d";
const GHO_POOLS = [
  "0x345fcdcd4f5f125f8acdb3241916025f05079a7a",
  "0xd60cc1154b937b85d70cbf88f913f36d67030540",
  "0x87512e62f635e8c6887ce371f9aec387105ed3bf",
];
const GHO_TOKENS = [GHO, IOU_GHO, IOU_BLP_GHO];

/** The static config as it stood before Meta GHO was added by hand. */
const PRE_GHO: V1Base = {
  reserves: V1_STATIC.reserves.filter((r) => r.address !== META_GHO),
  tokens: Object.fromEntries(Object.entries(V1_STATIC.tokens).filter(([a]) => !GHO_TOKENS.includes(a))),
  pools: V1_STATIC.pools.filter((p) => !GHO_POOLS.includes(p.address)),
  feeds: V1_STATIC.feeds.filter((f) => f !== GHO),
};

const ABI = parseAbi([
  "function nativeIou() view returns (address)",
  "function baseLpIou() view returns (address)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function pool_count() view returns (uint256)",
  "function pool_list(uint256 i) view returns (address)",
  "function coins(uint256 i) view returns (address)",
]);

// Mainnet state read on 2026-11-09, keyed by `${to}:${fn}:${arg}`.
const CHAIN: Record<string, unknown> = {
  [`${META_GHO}:nativeIou:`]: IOU_GHO,
  [`${META_GHO}:baseLpIou:`]: IOU_BLP_GHO,
  [`${GHO}:symbol:`]: "GHO",
  [`${GHO}:decimals:`]: 18,
  [`${IOU_GHO}:symbol:`]: "iouGHO",
  [`${IOU_GHO}:decimals:`]: 18,
  [`${IOU_BLP_GHO}:symbol:`]: "ioubLP",
  [`${IOU_BLP_GHO}:decimals:`]: 18,
};
// Curve factory: 12 static pools, then the 3 GHO pools at indexes 12-14.
const STATIC_POOLS = V1_STATIC.pools.filter((p) => !GHO_POOLS.includes(p.address));
const POOL_LIST = [...STATIC_POOLS.map((p) => p.address), ...GHO_POOLS];
const POOL_COINS: Record<string, [string, string]> = {
  ...Object.fromEntries(STATIC_POOLS.map((p) => [p.address, p.coins])),
  [GHO_POOLS[0]]: [GHO, CLR_USD],
  [GHO_POOLS[1]]: [IOU_GHO, CLR_USD],
  [GHO_POOLS[2]]: [IOU_BLP_GHO, CLR_USD],
};
let poolCount = POOL_LIST.length;

function fakeCall(_url: string, to: string, data: string): Promise<string> {
  const { functionName, args } = decodeFunctionData({ abi: ABI, data: data as Hex });
  const target = to.toLowerCase();
  let value: unknown;
  if (functionName === "pool_count" && target === V1_CURVE_FACTORY) value = BigInt(poolCount);
  else if (functionName === "pool_list" && target === V1_CURVE_FACTORY) value = POOL_LIST[Number(args![0])];
  else if (functionName === "coins") value = POOL_COINS[target]?.[Number(args![0])];
  else value = CHAIN[`${target}:${functionName}:`];
  if (value === undefined) return Promise.reject(new Error(`no fake for ${target}.${functionName}`));
  return Promise.resolve(encodeFunctionResult({ abi: ABI, functionName, result: value } as never));
}

beforeEach(() => {
  vi.clearAllMocks();
  poolCount = POOL_LIST.length;
  vi.mocked(rpcEthCall).mockImplementation(fakeCall);
});

describe("mergeRegistry", () => {
  it("returns the static config when nothing was discovered", () => {
    const reg = mergeRegistry(emptyDiscovered());
    expect(reg.reserves).toEqual(V1_STATIC.reserves);
    expect(reg.pools).toEqual(V1_STATIC.pools);
    expect(new Set(reg.emitters).size).toBe(reg.emitters.length);
  });
  it("adds discovered entries, keeps static ones on a clash, and lists the new emitters", () => {
    const d = emptyDiscovered();
    d.reserves.push({ address: "0xr", label: "Meta X", kind: "meta", createdBlock: 1 });
    d.tokens["0xiou"] = { symbol: "iouX", decimals: 6 };
    d.tokens[GHO] = { symbol: "WRONG", decimals: 6 };
    d.pools.push({ address: "0xp", label: "iouX / clrUSD", coins: ["0xiou", CLR_USD], notBefore: 1 });
    d.feeds.push("0xx");
    const reg = mergeRegistry(d, PRE_GHO);
    expect(reg.reserves.at(-1)).toEqual({ address: "0xr", label: "Meta X", kind: "meta" });
    expect(reg.tokens[GHO].symbol).toBe("WRONG"); // no static entry to protect
    expect(mergeRegistry(d).tokens[GHO].symbol).toBe("GHO"); // static wins
    expect(reg.feeds).toContain("0xx");
    expect(reg.emitters).toEqual(expect.arrayContaining(["0xr", "0xiou", "0xp"]));
  });
});

describe("parseNewReserve", () => {
  it("reads the real Meta GHO creation log", () => {
    expect(parseNewReserve(fx.newReserveGho)).toEqual({
      index: 4,
      reserveType: 1,
      reserve: META_GHO,
      name: "Clear Meta GHO",
      symbol: "mGHO",
      tokens: [V1_STATIC.reserves[0].address, GHO],
      block: 26355428,
    });
  });
  it("ignores other logs", () => {
    expect(parseNewReserve({ ...fx.newReserveGho, topics: [fx.newReserveGho.topics[0].replace("6a", "6b")] })).toBeNull();
  });
});

describe("discoverReserve", () => {
  it("rebuilds the hand-verified Meta GHO entries from chain reads alone", async () => {
    const found = await discoverReserve("u", parseNewReserve(fx.newReserveGho)!, mergeRegistry(emptyDiscovered(), PRE_GHO));
    expect(found).not.toBeNull();
    const staticGho = V1_STATIC.reserves.find((r) => r.address === META_GHO)!;
    expect({ address: found!.reserve.address, label: found!.reserve.label, kind: found!.reserve.kind }).toEqual(staticGho);
    expect(found!.reserve.createdBlock).toBe(26355428);
    for (const t of GHO_TOKENS) expect(found!.tokens[t]).toEqual(V1_STATIC.tokens[t]);
    expect(found!.feeds).toEqual([GHO]);
    expect(found!.emitters.sort()).toEqual([META_GHO, IOU_GHO, IOU_BLP_GHO].sort());
  });
  it("skips a Base reserve type, which it cannot describe", async () => {
    const ev = { ...parseNewReserve(fx.newReserveGho)!, reserveType: 0 };
    expect(await discoverReserve("u", ev, mergeRegistry(emptyDiscovered(), PRE_GHO))).toBeNull();
    expect(rpcEthCall).not.toHaveBeenCalled();
  });
});

describe("pool discovery", () => {
  const knownPools = new Set(PRE_GHO.pools.map((p) => p.address));

  it("first poll scans every pool and parks unknown ones with the deploy block as lower bound", async () => {
    const curve = await pollCurvePools("u", null, knownPools, 26_377_000);
    expect(curve.count).toBe(15);
    expect(curve.polledAt).toBe(26_377_000);
    expect(curve.unmatched.map((p) => p.address)).toEqual(GHO_POOLS);
    expect(curve.unmatched.every((p) => p.notBefore === V1_DEPLOY_BLOCK)).toBe(true);
  });
  it("a later poll reads only pool_count when nothing changed", async () => {
    const curve = { count: 15, polledAt: 26_377_000, unmatched: [] };
    const next = await pollCurvePools("u", curve, knownPools, 26_377_025);
    expect(rpcEthCall).toHaveBeenCalledTimes(1);
    expect(next).toEqual({ count: 15, polledAt: 26_377_025, unmatched: [] });
  });
  it("a new pool gets the previous poll's head, minus a margin, as lower bound", async () => {
    poolCount = 14;
    const first = await pollCurvePools("u", null, knownPools, 26_377_000);
    poolCount = 15;
    const second = await pollCurvePools("u", first, knownPools, 26_377_025);
    expect(second.unmatched.at(-1)).toEqual({
      address: GHO_POOLS[2], coins: [IOU_BLP_GHO, CLR_USD], notBefore: 26_377_000 - POOL_NOT_BEFORE_MARGIN,
    });
  });
  it("keeps a pool parked until both coins are known tokens, then labels it", () => {
    const unmatched = GHO_POOLS.map((address) => ({ address, coins: POOL_COINS[address], notBefore: 5 }));
    const before = matchPools(unmatched, mergeRegistry(emptyDiscovered(), PRE_GHO).tokens);
    expect(before.matched).toEqual([]);
    expect(before.rest).toHaveLength(3);
    const after = matchPools(unmatched, V1_STATIC.tokens);
    expect(after.rest).toEqual([]);
    expect(after.matched.map(({ address, label, coins }) => ({ address, label, coins })))
      .toEqual(V1_STATIC.pools.filter((p) => GHO_POOLS.includes(p.address)));
  });
});
