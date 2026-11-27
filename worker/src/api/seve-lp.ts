import { loadRegistry } from "../lib/clear-v1-registry";
import { getLastBlock } from "../lib/db";
import { MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";
import { rpcEthCall, rpcGetTipBlock } from "../lib/rpc";
import { SEVE_SAFES } from "@shared/lib/clear-v1-config";
import type { Holding } from "./seve-capital";

/**
 * What Sève holds as a liquidity provider in the Clear reserves, against what it put in.
 *
 * Holds: each reserve's stablecoins, times the fraction of the reserve's shares that are Sève's.
 * A meta reserve also holds base-reserve shares, so Sève's part of those counts towards its
 * fraction of the base reserve. On 17 Nov 2026 the Safes held every share of the four meta
 * reserves and, with those, every share of the base reserve.
 *
 * Put in: stablecoins the Safes sent to a reserve, less those sent back, over transactions that
 * move them one way only. A transaction with both directions is a rebalance or a swap: its gain
 * is counted with the rebalances, not here. Stablecoins sent to mint an IOU are counted as put in,
 * and are still in the reserve's balance, so they cancel out.
 *
 * Amounts are units of each stablecoin, not priced. While the transfer index is behind the chain,
 * what was put in is not known and is returned as null: never a partial sum.
 */

/** The index is current when it is within this many blocks of the tip, about 33 hours. */
const MAX_LAG_BLOCKS = 2 * MAX_BLOCKS_PER_SYNC;
export const isCurrent = (indexedTo: number, tip: number) => tip - indexedTo <= MAX_LAG_BLOCKS;

const BALANCE_OF = "0x70a08231";
const TOTAL_SUPPLY = "0x18160ddd";
const SAFES = SEVE_SAFES.map((s) => s.address);

export interface ReserveState {
  address: string;
  /** Shares outstanding and shares held directly by Sève's Safes. */
  supply: number;
  held: number;
  /** What the reserve holds: stablecoins, and for a meta reserve, shares of another reserve. */
  balances: Holding[];
}

/** Sève's stablecoins across the reserves. `reserves` must list a reserve before any reserve whose shares it holds. */
export function lookThrough(reserves: ReserveState[]): Holding[] {
  const addresses = new Set(reserves.map((r) => r.address));
  const viaOthers = new Map<string, number>();
  const out = new Map<string, number>();
  for (const r of reserves) {
    if (r.supply <= 0) continue;
    const fraction = Math.min(1, (r.held + (viaOthers.get(r.address) ?? 0)) / r.supply);
    for (const b of r.balances) {
      const target = addresses.has(b.token) ? viaOthers : out;
      target.set(b.token, (target.get(b.token) ?? 0) + b.amount * fraction);
    }
  }
  return [...out].map(([token, amount]) => ({ token, amount })).filter((h) => h.amount > 0);
}

export interface ReserveTransfer {
  txHash: string;
  token: string;
  direction: "out" | "in";
  amount: number;
}

/** Reserve shares moved between a Safe and an outside address, with what they held at that block. */
export interface ShareTransfer {
  direction: "out" | "in";
  value: Holding[];
}

/**
 * Net stablecoins put into the reserves, per token, over the one-way transactions. Shares sent
 * away take their stablecoins out of Sève's position, as a withdrawal would; shares received put
 * them in. Without this, shares given away would leave what bought them counted as put in.
 */
export function putIn(transfers: ReserveTransfer[], shares: ShareTransfer[] = []): Holding[] {
  const byTx = new Map<string, ReserveTransfer[]>();
  for (const t of transfers) byTx.set(t.txHash, [...(byTx.get(t.txHash) ?? []), t]);
  const net = new Map<string, number>();
  const add = (token: string, amount: number) => net.set(token, (net.get(token) ?? 0) + amount);
  for (const legs of byTx.values()) {
    if (new Set(legs.map((l) => l.direction)).size > 1) continue;
    for (const l of legs) add(l.token, l.direction === "out" ? l.amount : -l.amount);
  }
  for (const s of shares) for (const v of s.value) add(v.token, s.direction === "out" ? -v.amount : v.amount);
  return [...net].map(([token, amount]) => ({ token, amount }));
}

/** Total stablecoins of shares sent away less shares received. */
export const sharesSentAway = (shares: ShareTransfer[]) =>
  shares.reduce((a, s) => a + (s.direction === "out" ? 1 : -1) * total(s.value), 0);

const total = (h: Holding[]) => h.reduce((a, x) => a + x.amount, 0);

async function read(rpcUrl: string, to: string, data: string, decimals: number, block?: number): Promise<number> {
  const raw = await rpcEthCall(rpcUrl, to, data, block);
  if (!/^0x[0-9a-f]{64}$/i.test(raw)) throw new Error(`[seve-lp] bad result ${String(raw).slice(0, 80)}`);
  return Number(BigInt(raw)) / 10 ** decimals;
}
const balanceOf = (rpcUrl: string, token: string, holder: string, decimals: number, block?: number) =>
  read(rpcUrl, token, BALANCE_OF + holder.slice(2).padStart(64, "0"), decimals, block);

type Registry = Awaited<ReturnType<typeof loadRegistry>>["registry"];

/** Supply and balances of each reserve, metas before the base, with `held` read from `holders` (none: 0). */
export async function readReserves(
  rpcUrl: string, registry: Registry, reserves: Registry["reserves"], holders: string[], block?: number,
): Promise<ReserveState[]> {
  const decimals = (t: string) => registry.tokens[t]?.decimals ?? 18;
  // Meta reserves hold base shares, never the reverse: read them first.
  const ordered = [...reserves].sort((a, b) => Number(a.kind === "base") - Number(b.kind === "base"));
  return Promise.all(ordered.map(async (r): Promise<ReserveState> => {
    const [supply, held, balances] = await Promise.all([
      read(rpcUrl, r.address, TOTAL_SUPPLY, decimals(r.address), block),
      Promise.all(holders.map((s) => balanceOf(rpcUrl, r.address, s, decimals(r.address), block))),
      Promise.all(r.legs.map(async (t) => ({ token: t, amount: await balanceOf(rpcUrl, t, r.address, decimals(t), block) }))),
    ]);
    return { address: r.address, supply, held: held.reduce((a, b) => a + b, 0), balances };
  }));
}

/** The stablecoins `shares` of `reserve` stood for at `block`, through the base reserve for a meta. */
export async function shareValue(
  rpcUrl: string, registry: Registry, reserve: string, shares: number, block: number,
): Promise<Holding[]> {
  const r = registry.reserves.find((x) => x.address === reserve);
  if (!r) throw new Error(`[seve-lp] unknown reserve ${reserve}`);
  const inner = registry.reserves.filter((x) => r.legs.includes(x.address));
  const states = await readReserves(rpcUrl, registry, [r, ...inner], [], block);
  return lookThrough(states.map((s) => (s.address === reserve ? { ...s, held: shares } : s)));
}

export async function handleSeveLp(db: D1Database, rpcUrl: string | null): Promise<Response> {
  try {
    if (!rpcUrl) throw new Error("ROUTEMESH_RPC_URL missing");
    const { registry } = await loadRegistry(db);
    const decimals = (t: string) => registry.tokens[t]?.decimals ?? 18;
    const [states, rows, shareRows, indexedTo, sharesIndexedTo, tip] = await Promise.all([
      readReserves(rpcUrl, registry, registry.reserves, SAFES),
      db.prepare("SELECT tx_hash, token, direction, amount_raw FROM seve_reserve_transfers")
        .all<{ tx_hash: string; token: string; direction: "out" | "in"; amount_raw: string }>(),
      db.prepare("SELECT direction, value_json FROM seve_share_transfers")
        .all<{ direction: "out" | "in"; value_json: string }>(),
      getLastBlock(db, "seve-reserve-transfers"),
      getLastBlock(db, "seve-share-transfers"),
      rpcGetTipBlock(rpcUrl),
    ]);
    const holdings = lookThrough(states);
    const shares: ShareTransfer[] = shareRows.results.map((r) => ({ direction: r.direction, value: JSON.parse(r.value_json) }));
    const current = isCurrent(indexedTo, tip) && isCurrent(sharesIndexedTo, tip);
    const deposited = !current ? null : putIn(rows.results.map((r) => ({
      txHash: r.tx_hash, token: r.token, direction: r.direction, amount: Number(BigInt(r.amount_raw)) / 10 ** decimals(r.token),
    })), shares);
    const body = {
      holdings, deposited,
      valueUsd: total(holdings),
      depositedUsd: deposited && total(deposited),
      sentAwayUsd: current ? sharesSentAway(shares) : null,
      gainUsd: deposited && total(holdings) - total(deposited),
      indexedTo: Math.min(indexedTo, sharesIndexedTo), updatedAt: Math.floor(Date.now() / 1000),
    };
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, max-age=60" },
    });
  } catch (err) {
    console.error("[seve-lp]", err);
    return new Response(JSON.stringify({ error: "Unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
