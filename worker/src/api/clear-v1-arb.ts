import { loadRegistry } from "../lib/clear-v1-registry";
import { MEV_ADDRESSES, aggregateArb, dollarTokens, isBotTx, type ArbSwap, type BotTxRow } from "../lib/clear-v1-arb";

/** Arb bots on Clear V1: per bot, what it made, and what the treasury, LPs and the rebalancer made on its swaps. */
export async function handleClearV1Arb(db: D1Database): Promise<Response> {
  try {
    const marks = MEV_ADDRESSES.map(() => "?").join(", ");
    const [swaps, botTxs, { registry }] = await Promise.all([
      db.prepare(
        `SELECT tx_hash, timestamp, actor, tx_from, tx_to, token_in, token_out, amount_in_raw, amount_out_raw,
                volume_units, fee_treasury_units, fee_lp_units, fee_trader_units
         FROM clear_v1_events
         WHERE kind = 'swap' AND tx_from IS NOT NULL
           AND (tx_from = tx_to OR tx_from IN (${marks}) OR tx_to IN (${marks}) OR actor IN (${marks}))`
      ).bind(...MEV_ADDRESSES, ...MEV_ADDRESSES, ...MEV_ADDRESSES).all<ArbSwap>(),
      db.prepare("SELECT tx_hash, eth_usd, gas_eth, gross_usd FROM clear_v1_bot_txs").all<BotTxRow>(),
      loadRegistry(db),
    ]);
    const bots = swaps.results.filter(isBotTx);
    const updatedAt = bots.reduce((a, s) => Math.max(a, s.timestamp), 0) || null;
    return new Response(JSON.stringify({ ...aggregateArb(bots, botTxs.results, dollarTokens(registry)), updatedAt }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, max-age=60" },
    });
  } catch (err) {
    console.error("[clear-v1-arb] failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
