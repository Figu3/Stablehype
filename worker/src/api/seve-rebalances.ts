import { loadRegistry } from "../lib/clear-v1-registry";
import { SEVE_SAFES } from "@shared/lib/clear-v1-config";

/**
 * What Sève makes on its Clear V1 rebalances.
 *
 * `rebalanceSwap` prices both legs at their own redemption price, so supplying USDC (redeems at 1.0)
 * for over-weight USDT (redeems at 0.9992) pays out 1 / 0.9992 USDT per USDC: about 8 bps more units
 * than went in. That surplus is the gross gain. Sève then redeems the units it received at the issuer,
 * which costs `costBps` on the redeemed leg; that cost is not on-chain, so it is a parameter.
 *
 * Only legs that are $1 stablecoins are counted. A leg that is a Clear reserve's own LP token (bLP)
 * is worth its NAV, not $1, so such a rebalance is listed but left unpriced.
 */

export const DEFAULT_COST_BPS = 1;
const MAX_COST_BPS = 100;
/** Rows sent to the page. Totals and flows are computed over every row read. */
const MAX_ROWS = 200;
const MAX_SCAN = 5000;
const DAY = 86_400;
export const FLOW_WINDOWS = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, "90d": 90 * DAY } as const;
export type FlowWindow = keyof typeof FLOW_WINDOWS;
type Windowed = Record<FlowWindow, number>;

export interface TokenFlow {
  token: string;
  /** Received from a reserve and sent to the issuer in the same transaction. */
  redeemed: Windowed;
  /** Supplied to a reserve: what the issuer minted to Sève beforehand. */
  minted: Windowed;
}

const emptyWindows = (): Windowed => ({ "24h": 0, "7d": 0, "30d": 0, "90d": 0 });

/**
 * What Sève redeemed and minted per stablecoin, read off its rebalances. Checked on-chain
 * (0xd1673588c9..., 12 Nov 2026): the Safe forwards the stablecoin it receives to the issuer inside
 * the rebalance transaction, and the stablecoin it supplies arrived from the issuer just before.
 * A bLP leg is a reserve share, neither redeemed nor minted.
 */
export function rebalanceFlows(rows: RebalanceGain[], isLpToken: (token: string) => boolean, nowSec: number): TokenFlow[] {
  const flows = new Map<string, TokenFlow>();
  const add = (token: string, side: "redeemed" | "minted", amount: number, age: number) => {
    if (isLpToken(token)) return;
    let f = flows.get(token);
    if (!f) flows.set(token, (f = { token, redeemed: emptyWindows(), minted: emptyWindows() }));
    for (const w of Object.keys(FLOW_WINDOWS) as FlowWindow[]) if (age <= FLOW_WINDOWS[w]) f[side][w] += amount;
  };
  for (const r of rows) {
    add(r.tokenOut, "redeemed", r.amountOut, nowSec - r.timestamp);
    add(r.tokenIn, "minted", r.amountIn, nowSec - r.timestamp);
  }
  return [...flows.values()];
}

export interface RebalanceRow {
  tx_hash: string;
  timestamp: number;
  contract: string;
  actor: string | null;
  token_in: string;
  token_out: string;
  amount_in_raw: string;
  amount_out_raw: string;
}

export interface RebalanceGain {
  txHash: string;
  timestamp: number;
  reserve: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  /** amountOut less amountIn, in $1 units. Null when a leg is not a $1 stablecoin. */
  grossUsd: number | null;
  grossBps: number | null;
  netUsd: number | null;
  netBps: number | null;
}

export interface RebalanceGains {
  costBps: number;
  count: number;
  pricedCount: number;
  volumeUsd: number;
  grossUsd: number;
  netUsd: number;
  /** Volume-weighted, over priced rebalances. Null when none is priced. */
  grossBps: number | null;
  netBps: number | null;
  rows: RebalanceGain[];
}

const toUnits = (raw: string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;

export function rebalanceGains(
  rows: RebalanceRow[],
  decimalsOf: (token: string) => number | undefined,
  isLpToken: (token: string) => boolean,
  costBps = DEFAULT_COST_BPS,
): RebalanceGains {
  const out: RebalanceGain[] = [];
  let volume = 0, gross = 0, net = 0, priced = 0;
  for (const r of rows) {
    const dIn = decimalsOf(r.token_in);
    const dOut = decimalsOf(r.token_out);
    if (dIn === undefined || dOut === undefined) continue;
    const amountIn = toUnits(r.amount_in_raw, dIn);
    const amountOut = toUnits(r.amount_out_raw, dOut);
    const isPriced = !isLpToken(r.token_in) && !isLpToken(r.token_out) && amountIn > 0;
    let g: Pick<RebalanceGain, "grossUsd" | "grossBps" | "netUsd" | "netBps"> = {
      grossUsd: null, grossBps: null, netUsd: null, netBps: null,
    };
    if (isPriced) {
      const grossUsd = amountOut - amountIn;
      const netUsd = grossUsd - (amountOut * costBps) / 10_000;
      g = { grossUsd, grossBps: (grossUsd / amountIn) * 10_000, netUsd, netBps: (netUsd / amountIn) * 10_000 };
      volume += amountIn; gross += grossUsd; net += netUsd; priced += 1;
    }
    out.push({
      txHash: r.tx_hash, timestamp: r.timestamp, reserve: r.contract,
      tokenIn: r.token_in, tokenOut: r.token_out, amountIn, amountOut, ...g,
    });
  }
  return {
    costBps,
    count: out.length,
    pricedCount: priced,
    volumeUsd: volume,
    grossUsd: gross,
    netUsd: net,
    grossBps: volume > 0 ? (gross / volume) * 10_000 : null,
    netBps: volume > 0 ? (net / volume) * 10_000 : null,
    rows: out,
  };
}

export async function handleSeveRebalances(db: D1Database, url: URL): Promise<Response> {
  try {
    const raw = Number(url.searchParams.get("costBps") ?? DEFAULT_COST_BPS);
    const costBps = Number.isFinite(raw) ? Math.max(0, Math.min(raw, MAX_COST_BPS)) : DEFAULT_COST_BPS;
    const safes = SEVE_SAFES.map((s) => s.address);
    const marks = safes.map(() => "?").join(", ");
    // A Safe shows up as the actor, an EOA as tx_from.
    const [rows, { registry }] = await Promise.all([
      db.prepare(
        `SELECT tx_hash, timestamp, contract, actor, token_in, token_out, amount_in_raw, amount_out_raw
         FROM clear_v1_events
         WHERE kind = 'rebalance' AND (actor IN (${marks}) OR tx_from IN (${marks}))
           AND amount_in_raw IS NOT NULL AND amount_out_raw IS NOT NULL
         ORDER BY block_number DESC, log_index DESC LIMIT ?`,
      ).bind(...safes, ...safes, MAX_SCAN).all<RebalanceRow>(),
      loadRegistry(db),
    ]);
    const lp = new Set(registry.reserves.map((r) => r.address));
    const gains = rebalanceGains(
      rows.results,
      (t) => registry.tokens[t]?.decimals,
      (t) => lp.has(t),
      costBps,
    );
    const flows = rebalanceFlows(gains.rows, (t) => lp.has(t), Math.floor(Date.now() / 1000));
    return new Response(JSON.stringify({ ...gains, rows: gains.rows.slice(0, MAX_ROWS), flows, tokens: registry.tokens }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, max-age=60" },
    });
  } catch (err) {
    console.error("[seve-rebalances] failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
