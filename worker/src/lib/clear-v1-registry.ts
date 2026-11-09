import { decodeEventLog, decodeFunctionResult, encodeFunctionData, parseAbi, type Hex } from "viem";
import { getCache, setCache } from "./db";
import { rpcEthCall } from "./rpc";
import {
  V1_BASE_RESERVE, V1_CURVE_FACTORY, V1_DEPLOY_BLOCK, V1_FACTORY, V1_STATIC,
  emptyDiscovered, mergeRegistry,
  type Discovered, type V1Base, type V1Pool, type V1Registry, type V1Reserve, type V1Token,
} from "@shared/lib/clear-v1-config";

/**
 * Self-discovery of Clear V1 reserves and pools, on top of the static seed in clear-v1-config.ts.
 *
 * Reserves: the factory has no enumerable getter, but every clone logs NewClearReserve. The events
 * cron already scans the factory, so a log for an unknown reserve triggers discoverReserve().
 * Pools: Clear's Curve factory is enumerable (pool_count/pool_list). A pool is adopted once both
 * its coins are known tokens, so a pool for a reserve not yet discovered waits in `unmatched`.
 */

export const REGISTRY_CACHE_KEY = "clear-v1-registry";
const META_RESERVE_TYPE = 1; // factory reserveType: 0 Base, 1 Meta (checked on all 5 live reserves)
/** RouteMesh balances across nodes that can lag the head a little. */
export const POOL_NOT_BEFORE_MARGIN = 64;

const ABI = parseAbi([
  "function nativeIou() view returns (address)",
  "function baseLpIou() view returns (address)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function pool_count() view returns (uint256)",
  "function pool_list(uint256 i) view returns (address)",
  "function coins(uint256 i) view returns (address)",
]);
const NEW_RESERVE = parseAbi([
  "event NewClearReserve(uint256 indexed index, address indexed implementation, uint8 reserveType, address reserve, string name, string symbol, address[] tokens)",
]);

type Fn = (typeof ABI)[number]["name"];

async function read<T>(rpcUrl: string, to: string, fn: Fn, args: readonly unknown[] = []): Promise<T> {
  const data = encodeFunctionData({ abi: ABI, functionName: fn, args } as never);
  const raw = await rpcEthCall(rpcUrl, to, data);
  return decodeFunctionResult({ abi: ABI, functionName: fn, data: raw as Hex } as never) as T;
}

const lower = (a: string) => a.toLowerCase();

export async function loadRegistry(db: D1Database, base: V1Base = V1_STATIC): Promise<{ discovered: Discovered; registry: V1Registry }> {
  const cached = await getCache(db, REGISTRY_CACHE_KEY);
  // A corrupt row throws: silently starting empty would forget adopted reserves.
  const discovered = cached ? { ...emptyDiscovered(), ...(JSON.parse(cached.value) as Discovered) } : emptyDiscovered();
  return { discovered, registry: mergeRegistry(discovered, base) };
}

export const saveDiscovered = (db: D1Database, d: Discovered) => setCache(db, REGISTRY_CACHE_KEY, JSON.stringify(d));

export interface NewReserveEvent {
  index: number;
  reserveType: number;
  reserve: string;
  name: string;
  symbol: string;
  tokens: string[];
  block: number;
}

export function parseNewReserve(log: { address: string; topics: string[]; data: string; blockNumber: string }): NewReserveEvent | null {
  if (lower(log.address) !== V1_FACTORY) return null;
  try {
    const { args } = decodeEventLog({ abi: NEW_RESERVE, topics: log.topics as [Hex, ...Hex[]], data: log.data as Hex });
    return {
      index: Number(args.index),
      reserveType: args.reserveType,
      reserve: lower(args.reserve),
      name: args.name,
      symbol: args.symbol,
      tokens: args.tokens.map(lower),
      block: parseInt(log.blockNumber, 16),
    };
  } catch {
    return null;
  }
}

export interface FoundReserve {
  reserve: V1Reserve & { createdBlock: number };
  tokens: Record<string, V1Token>;
  feeds: string[];
  emitters: string[];
}

/**
 * Describe a new Meta reserve from chain reads. Returns null for a shape it cannot describe
 * (a second Base reserve, or a Meta not paired with our bLP): that one stays in unknownReserves.
 */
export async function discoverReserve(rpcUrl: string, ev: NewReserveEvent, reg: V1Registry): Promise<FoundReserve | null> {
  if (ev.reserveType !== META_RESERVE_TYPE || ev.tokens.length !== 2 || ev.tokens[0] !== V1_BASE_RESERVE) return null;
  const native = ev.tokens[1];
  const [nativeIou, baseLpIou] = (await Promise.all([
    read<string>(rpcUrl, ev.reserve, "nativeIou"),
    read<string>(rpcUrl, ev.reserve, "baseLpIou"),
  ])).map(lower);
  const token = async (a: string): Promise<V1Token> =>
    reg.tokens[a] ?? { symbol: await read<string>(rpcUrl, a, "symbol"), decimals: Number(await read<number>(rpcUrl, a, "decimals")) };
  const nativeToken = await token(native);
  const iou = await token(nativeIou);
  const blpIou = await token(baseLpIou);
  return {
    reserve: { address: ev.reserve, label: `Meta ${nativeToken.symbol}`, kind: "meta", createdBlock: ev.block },
    tokens: {
      [native]: nativeToken,
      [nativeIou]: iou,
      // Every Meta's bLP IOU has the on-chain symbol "ioubLP": name it by its reserve.
      [baseLpIou]: { ...blpIou, symbol: `ioubLP (${nativeToken.symbol})` },
    },
    feeds: [native],
    emitters: [ev.reserve, nativeIou, baseLpIou],
  };
}

type Curve = NonNullable<Discovered["curve"]>;

/** One pool_count read per tick; pool_list and coins only for new indexes. */
export async function pollCurvePools(rpcUrl: string, curve: Discovered["curve"], knownPools: Set<string>, head: number): Promise<Curve> {
  const count = Number(await read<bigint>(rpcUrl, V1_CURVE_FACTORY, "pool_count"));
  const start = curve?.count ?? 0;
  // A pool not listed at the last poll was created after that poll's head.
  const notBefore = curve ? Math.max(V1_DEPLOY_BLOCK, curve.polledAt - POOL_NOT_BEFORE_MARGIN) : V1_DEPLOY_BLOCK;
  const unmatched = [...(curve?.unmatched ?? [])];
  for (let i = start; i < count; i++) {
    const address = lower(await read<string>(rpcUrl, V1_CURVE_FACTORY, "pool_list", [BigInt(i)]));
    if (knownPools.has(address)) continue;
    const coins = (await Promise.all([0n, 1n].map((c) => read<string>(rpcUrl, address, "coins", [c])))).map(lower) as [string, string];
    unmatched.push({ address, coins, notBefore });
  }
  return { count: Math.max(count, start), polledAt: head, unmatched };
}

export function matchPools(unmatched: Curve["unmatched"], tokens: Record<string, V1Token>) {
  const matched: (V1Pool & { notBefore: number })[] = [];
  const rest: Curve["unmatched"] = [];
  for (const p of unmatched) {
    if (p.coins.every((c) => tokens[c])) {
      matched.push({ address: p.address, label: `${tokens[p.coins[0]].symbol} / ${tokens[p.coins[1]].symbol}`, coins: p.coins, notBefore: p.notBefore });
    } else {
      rest.push(p);
    }
  }
  return { matched, rest };
}
