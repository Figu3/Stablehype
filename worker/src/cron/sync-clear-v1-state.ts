import { decodeFunctionResult, encodeFunctionData, formatUnits, parseAbi, type Hex } from "viem";
import { setCache } from "../lib/db";
import { rpcEthCall } from "../lib/rpc";
import { loadRegistry } from "../lib/clear-v1-registry";
import { V1_BASE_RESERVE, V1_GAS_WATCHLIST, V1_ORACLE, type V1Reserve, type V1Token } from "@shared/lib/clear-v1-config";

/**
 * Every 15 min: one Multicall3 read into cache row "clear-v1-state", plus an upsert of
 * today's clear_v1_snapshots. Meta value reads revert when the oracle is stale, so each
 * sub-call may fail on its own: its field becomes null and the rest of the row still lands.
 */

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const STATE_CACHE_KEY = "clear-v1-state";
const ONE = 10n ** 18n;

const ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
  "function getEthBalance(address addr) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function baseLpValue() view returns (uint256)",
  "function nativeValue() view returns (uint256)",
  "function totalIOUDebt() view returns (uint256)",
  "function totalReserveValue() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function paused() view returns (bool)",
  "function rebalanceNeeded() view returns (bool)",
  "function swapSpreadMinBps() view returns (uint256)",
  "function swapSpreadMaxBps() view returns (uint256)",
  "function baseQuoteFeeBps() view returns (uint256)",
  "function singleAssetFeeBps() view returns (uint256)",
  "function flashFeeBps() view returns (uint256)",
  "function convertToRedemptionValue(uint256 shares) view returns (uint256)",
  "function balances(uint256 i) view returns (uint256)",
  "function admin_balances(uint256 i) view returns (uint256)",
  "function isRouteOpen(address tokenIn, address tokenOut) view returns (bool)",
  "function oracleConfiguration(address asset) view returns (bool enabled, uint8 assetDecimals, uint8 oracleDecimals, uint256 redemptionPrice, uint256 priceTTL, uint256 lastUpdateTimestamp, uint256 price)",
]);

type Fn = (typeof ABI)[number]["name"];

interface Call {
  target: string;
  fn: Fn;
  args?: readonly unknown[];
}

async function multicall(rpcUrl: string, calls: Call[]): Promise<(unknown | null)[]> {
  const data = encodeFunctionData({
    abi: ABI,
    functionName: "aggregate3",
    args: [calls.map((c) => ({
      target: c.target as Hex,
      allowFailure: true,
      callData: encodeFunctionData({ abi: ABI, functionName: c.fn, args: c.args ?? [] } as never),
    }))],
  });
  const raw = await rpcEthCall(rpcUrl, MULTICALL3, data);
  const results = decodeFunctionResult({ abi: ABI, functionName: "aggregate3", data: raw as Hex }) as readonly {
    success: boolean;
    returnData: Hex;
  }[];
  return results.map((r, i) =>
    r.success
      ? decodeFunctionResult({ abi: ABI, functionName: calls[i].fn, data: r.returnData } as never)
      : null
  );
}

const par = (v: unknown): number | null => (typeof v === "bigint" ? Number(formatUnits(v, 18)) : null);
const num = (v: unknown): number | null => (typeof v === "bigint" ? Number(v) : null);
const units = (v: unknown, token: V1Token | undefined): number | null =>
  typeof v === "bigint" && token ? Number(formatUnits(v, token.decimals)) : null;

// Drops null fields so json_patch keeps the last good value instead of deleting it.
export const compact = (v: unknown) => JSON.stringify(v, (_k, x) => (x === null ? undefined : x));

// Pool balances are keyed by coin address in the snapshot, not stored as arrays: compact
// cannot drop a null inside an array and json_patch replaces whole arrays, so a failed read
// would overwrite a good balance. As objects, compact drops the failed key and json_patch keeps it.
export const keyByCoin = (coins: readonly string[], values: (number | null)[]): Record<string, number | null> =>
  Object.fromEntries(coins.map((c, i) => [c, values[i]]));

export const poolSnapshotJson = (p: V1State["pools"][number]) =>
  compact({ balances: keyByCoin(p.coins, p.balances), adminBalances: keyByCoin(p.coins, p.adminBalances) });

export const UPSERT_SNAPSHOT_SQL =
  `INSERT INTO clear_v1_snapshots (date, contract, gross_par, net_par, iou_debt_par, blp_redemption_price, state_json)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(date, contract) DO UPDATE SET
       gross_par = COALESCE(excluded.gross_par, gross_par),
       net_par = COALESCE(excluded.net_par, net_par),
       iou_debt_par = COALESCE(excluded.iou_debt_par, iou_debt_par),
       blp_redemption_price = COALESCE(excluded.blp_redemption_price, blp_redemption_price),
       state_json = json_patch(state_json, excluded.state_json)`;

export interface V1Route {
  reserve: string;
  tokenIn: string;
  tokenOut: string;
}

/** Every ordered pair of a reserve's legs: a route can be open one way and shut the other. */
export const routePairs = (reserves: V1Reserve[]): V1Route[] =>
  reserves.flatMap((r) =>
    r.legs.flatMap((tokenIn) => r.legs.filter((t) => t !== tokenIn).map((tokenOut) => ({ reserve: r.address, tokenIn, tokenOut }))));

export interface V1State {
  updatedAt: number;
  blpRedemptionPrice: number | null;
  reserves: {
    address: string; label: string; kind: "base" | "meta";
    grossPar: number | null; netPar: number | null; iouDebtPar: number | null;
    nativeValue: number | null; baseLpValue: number | null; supply: number | null;
    paused: boolean | null; rebalanceNeeded: boolean | null;
    params: Record<string, number | null>;
  }[];
  pools: { address: string; label: string; coins: string[]; balances: (number | null)[]; adminBalances: (number | null)[] }[];
  feeds: { asset: string; symbol: string; lastUpdate: number | null; ttl: number | null; price: number | null }[];
  wallets: { address: string; label: string; balanceEth: number | null }[];
  /** isRouteOpen as the reserve answers it now. null: the read failed. */
  routes: (V1Route & { open: boolean | null })[];
}

export async function syncClearV1State(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) throw new Error("[clear-v1-state] ROUTEMESH_RPC_URL missing");
  const { registry: reg } = await loadRegistry(db);

  const RESERVE_FNS: Fn[] = [
    "totalIOUDebt", "totalReserveValue", "totalSupply", "paused", "rebalanceNeeded",
    "swapSpreadMinBps", "swapSpreadMaxBps", "baseQuoteFeeBps", "singleAssetFeeBps", "flashFeeBps",
  ];
  const calls: Call[] = [];
  const at = new Map<string, number>();
  const add = (key: string, c: Call) => { at.set(key, calls.length); calls.push(c); };

  for (const r of reg.reserves) {
    for (const fn of RESERVE_FNS) add(`${r.address}:${fn}`, { target: r.address, fn });
    if (r.kind === "base") {
      add(`${r.address}:totalAssets`, { target: r.address, fn: "totalAssets" });
    } else {
      add(`${r.address}:nativeValue`, { target: r.address, fn: "nativeValue" });
      add(`${r.address}:baseLpValue`, { target: r.address, fn: "baseLpValue" });
    }
  }
  add("blp", { target: V1_BASE_RESERVE, fn: "convertToRedemptionValue", args: [ONE] });
  for (const p of reg.pools) {
    for (const i of [0n, 1n]) {
      add(`${p.address}:balances:${i}`, { target: p.address, fn: "balances", args: [i] });
      add(`${p.address}:admin:${i}`, { target: p.address, fn: "admin_balances", args: [i] });
    }
  }
  for (const f of reg.feeds) add(`feed:${f}`, { target: V1_ORACLE, fn: "oracleConfiguration", args: [f] });
  const routes = routePairs(reg.reserves);
  for (const r of routes) add(`route:${r.reserve}:${r.tokenIn}:${r.tokenOut}`, { target: r.reserve, fn: "isRouteOpen", args: [r.tokenIn, r.tokenOut] });
  for (const w of V1_GAS_WATCHLIST) add(`eth:${w.address}`, { target: MULTICALL3, fn: "getEthBalance", args: [w.address] });

  const results = await multicall(rpcUrl, calls); // a total failure throws; the previous row stays
  const get = (key: string) => results[at.get(key)!];

  const state: V1State = {
    updatedAt: Math.floor(Date.now() / 1000),
    blpRedemptionPrice: par(get("blp")),
    reserves: reg.reserves.map((r) => {
      const k = (fn: string) => get(`${r.address}:${fn}`);
      const nativeValue = r.kind === "meta" ? par(k("nativeValue")) : null;
      const baseLpValue = r.kind === "meta" ? par(k("baseLpValue")) : null;
      const grossPar = r.kind === "base"
        ? par(k("totalAssets"))
        : nativeValue !== null && baseLpValue !== null ? nativeValue + baseLpValue : null;
      return {
        address: r.address, label: r.label, kind: r.kind,
        grossPar, netPar: par(k("totalReserveValue")), iouDebtPar: par(k("totalIOUDebt")),
        nativeValue, baseLpValue, supply: par(k("totalSupply")),
        paused: k("paused") as boolean | null,
        rebalanceNeeded: k("rebalanceNeeded") as boolean | null,
        params: {
          swapSpreadMinBps: num(k("swapSpreadMinBps")),
          swapSpreadMaxBps: num(k("swapSpreadMaxBps")),
          baseQuoteFeeBps: num(k("baseQuoteFeeBps")),
          singleAssetFeeBps: num(k("singleAssetFeeBps")),
          flashFeeBps: num(k("flashFeeBps")),
        },
      };
    }),
    pools: reg.pools.map((p) => ({
      address: p.address, label: p.label, coins: p.coins,
      balances: [0, 1].map((i) => units(get(`${p.address}:balances:${i}`), reg.tokens[p.coins[i]])),
      adminBalances: [0, 1].map((i) => units(get(`${p.address}:admin:${i}`), reg.tokens[p.coins[i]])),
    })),
    feeds: reg.feeds.map((asset) => {
      const c = get(`feed:${asset}`) as readonly [boolean, number, number, bigint, bigint, bigint, bigint] | null;
      return {
        asset, symbol: reg.tokens[asset]?.symbol ?? asset,
        lastUpdate: c ? Number(c[5]) : null,
        ttl: c ? Number(c[4]) : null,
        price: c ? Number(c[6]) / 10 ** c[2] : null,
      };
    }),
    wallets: V1_GAS_WATCHLIST.map((w) => ({
      address: w.address, label: w.label, balanceEth: par(get(`eth:${w.address}`)),
    })),
    routes: routes.map((r) => {
      const v = get(`route:${r.reserve}:${r.tokenIn}:${r.tokenOut}`);
      return { ...r, open: typeof v === "boolean" ? v : null };
    }),
  };

  await setCache(db, STATE_CACHE_KEY, JSON.stringify(state));

  const date = new Date().toISOString().slice(0, 10);
  const contracts = [
    ...state.reserves.map((r) => ({
      contract: r.address, gross: r.grossPar, net: r.netPar, debt: r.iouDebtPar,
      blp: r.address === V1_BASE_RESERVE ? state.blpRedemptionPrice : null,
      json: compact({ nativeValue: r.nativeValue, baseLpValue: r.baseLpValue, supply: r.supply, params: r.params }),
    })),
    ...state.pools.map((p) => ({
      contract: p.address, gross: null, net: null, debt: null, blp: null,
      json: poolSnapshotJson(p),
    })),
  ];
  const upsert = db.prepare(UPSERT_SNAPSHOT_SQL);
  await db.batch(contracts.map((c) => upsert.bind(date, c.contract, c.gross, c.net, c.debt, c.blp, c.json)));
}
