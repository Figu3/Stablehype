import { loadRegistry } from "../lib/clear-v1-registry";
import { SEVE_ISSUER_TOKENS } from "@shared/lib/clear-v1-config";

/**
 * What Sève converts with issuers between two rebalances, paired from seve_transfers.
 *
 * Traced on 16 Nov 2026 (0x501f3913..., 0x59d4e1c7..., 0xc6461678...): a rebalance leaves Sève with
 * USDT, which it sends to Paxos; Paxos mints USDG to the Safe about 20 blocks later; the Safe then
 * burns the USDG for USDC, which it supplies to the next rebalance.
 *
 * Not every USDG leaves through Paxos. Sève also sells some on the market, where the USDG goes out
 * and the USDC comes back inside one transaction (0xc6461678..., through a router). That is a swap:
 * the USDG still exists, so it must not count as burnt.
 *
 * A conversion is one stablecoin going out and another coming back. Sends of the receipt's own
 * transaction are a swap and pair with it whatever the amounts. Otherwise nothing on-chain ties
 * the two legs, so they are paired by amount: a receipt takes the run of pending sends of another
 * stablecoin whose total is closest to it, within `TOLERANCE`. Two sends can be paid back at once,
 * or one by one. A receipt that pairs with nothing is counted, not guessed.
 */

const TOLERANCE = 0.002;
const WINDOW_SECONDS = 90 * 86_400;

export interface Transfer {
  txHash: string;
  timestamp: number;
  token: string;
  direction: "out" | "in";
  amount: number;
}

export interface Conversion {
  /** When the stablecoin came back. */
  timestamp: number;
  txHash: string;
  /**
   * swap: both legs in one transaction, on the market. Across transactions, with the issuer:
   * mint (received an issuer token), burn (sent one), or convert (neither leg is one).
   */
  kind: "swap" | "mint" | "burn" | "convert";
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
}

interface Send {
  txHash: string;
  amount: number;
}

/** `transfers` in chain order. */
export function pairConversions(transfers: Transfer[], issuerTokens: readonly string[] = SEVE_ISSUER_TOKENS) {
  const pending = new Map<string, Send[]>();
  const conversions: Conversion[] = [];
  let unpaired = 0;
  for (const t of transfers) {
    if (t.direction === "out") {
      pending.set(t.token, [...(pending.get(t.token) ?? []), { txHash: t.txHash, amount: t.amount }]);
      continue;
    }
    let match: { token: string; start: number; end: number; total: number; swap: boolean } | null = null;
    let bestGap = Infinity;
    for (const [token, sends] of pending) {
      if (token === t.token) continue;
      const sameTx = sends.map((s, i) => (s.txHash === t.txHash ? i : -1)).filter((i) => i >= 0);
      if (sameTx.length > 0) {
        const [start, end] = [sameTx[0], sameTx[sameTx.length - 1]];
        match = { token, start, end, total: sends.slice(start, end + 1).reduce((a, x) => a + x.amount, 0), swap: true };
        break;
      }
      for (let start = 0; start < sends.length; start++) {
        let total = 0;
        for (let end = start; end < sends.length; end++) {
          total += sends[end].amount;
          const gap = Math.abs(total - t.amount) / t.amount;
          if (gap <= TOLERANCE && gap < bestGap) { bestGap = gap; match = { token, start, end, total, swap: false }; }
        }
      }
    }
    if (!match) { unpaired += 1; continue; }
    pending.get(match.token)!.splice(match.start, match.end - match.start + 1);
    conversions.push({
      timestamp: t.timestamp, txHash: t.txHash,
      kind: match.swap ? "swap" : issuerTokens.includes(t.token) ? "mint" : issuerTokens.includes(match.token) ? "burn" : "convert",
      tokenIn: match.token, tokenOut: t.token, amountIn: match.total, amountOut: t.amount,
    });
  }
  return { conversions, unpaired };
}

interface Row {
  tx_hash: string;
  timestamp: number;
  token: string;
  direction: "out" | "in";
  amount_raw: string;
}

export async function handleSeveConversions(db: D1Database): Promise<Response> {
  try {
    const since = Math.floor(Date.now() / 1000) - WINDOW_SECONDS;
    const [rows, { registry }] = await Promise.all([
      db.prepare(
        `SELECT tx_hash, timestamp, token, direction, amount_raw FROM seve_transfers
         WHERE timestamp >= ? ORDER BY block_number, log_index`,
      ).bind(since).all<Row>(),
      loadRegistry(db),
    ]);
    const paired = pairConversions(rows.results.map((r) => ({
      txHash: r.tx_hash, timestamp: r.timestamp, token: r.token, direction: r.direction,
      amount: Number(BigInt(r.amount_raw)) / 10 ** (registry.tokens[r.token]?.decimals ?? 18),
    })));
    return new Response(JSON.stringify({ ...paired, conversions: paired.conversions.reverse(), tokens: registry.tokens }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, max-age=60" },
    });
  } catch (err) {
    console.error("[seve-conversions] failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
