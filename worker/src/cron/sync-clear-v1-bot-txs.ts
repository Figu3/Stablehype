import { fetchEthPriceChainlink, rpcGetReceiptWithLogs } from "../lib/rpc";
import { loadRegistry } from "../lib/clear-v1-registry";
import { MEV_ADDRESSES, botAddresses, dollarTokens, isBotTx, netFlows, priceFlows } from "../lib/clear-v1-arb";

/**
 * Read what each bot swap tx left its bot with, into clear_v1_bot_txs. There is no cursor: the
 * work list is the bot swaps of clear_v1_events with no row yet, newest first, so a new tag in
 * V1_KNOWN_ACTORS backfills that bot by itself. A failure throws and the tx is retried next tick.
 */

// Two RPC calls per tx, on the Worker's shared subrequest budget.
const MAX_TXS_PER_RUN = 15;

interface Pending {
  tx_hash: string;
  block_number: number;
  timestamp: number;
  actor: string | null;
  tx_from: string;
  tx_to: string | null;
}

export async function syncClearV1BotTxs(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) throw new Error("[clear-v1-bot-txs] ROUTEMESH_RPC_URL missing");

  const marks = MEV_ADDRESSES.map(() => "?").join(", ");
  // The SQL mirrors v1EventTag: a known bot address, or a sender that called itself.
  const rows = await db
    .prepare(
      `SELECT e.tx_hash, MIN(e.block_number) block_number, MIN(e.timestamp) timestamp, e.actor, e.tx_from, e.tx_to
       FROM clear_v1_events e LEFT JOIN clear_v1_bot_txs b ON b.tx_hash = e.tx_hash
       WHERE e.kind = 'swap' AND b.tx_hash IS NULL AND e.tx_from IS NOT NULL
         AND (e.tx_from = e.tx_to OR e.tx_from IN (${marks}) OR e.tx_to IN (${marks}) OR e.actor IN (${marks}))
       GROUP BY e.tx_hash ORDER BY block_number DESC LIMIT ?`
    )
    .bind(...MEV_ADDRESSES, ...MEV_ADDRESSES, ...MEV_ADDRESSES, MAX_TXS_PER_RUN)
    .all<Pending>();
  const pending = rows.results.filter(isBotTx);
  if (pending.length === 0) return;

  const dollars = dollarTokens((await loadRegistry(db)).registry);
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO clear_v1_bot_txs
     (tx_hash, bot, block_number, timestamp, eth_usd, gas_eth, gross_usd, flows_json, unpriced)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  for (const tx of pending) {
    const [receipt, ethUsd] = await Promise.all([
      rpcGetReceiptWithLogs(rpcUrl, tx.tx_hash),
      fetchEthPriceChainlink(rpcUrl, tx.block_number),
    ]);
    const flows = netFlows(receipt.logs, botAddresses(tx));
    const { grossUsd, unpriced } = priceFlows(flows, dollars, ethUsd);
    await stmt.bind(
      tx.tx_hash, tx.tx_from.toLowerCase(), tx.block_number, tx.timestamp, ethUsd,
      (receipt.gasUsed * receipt.effectiveGasPrice) / 1e18, grossUsd,
      JSON.stringify(Object.fromEntries(Object.entries(flows).map(([t, v]) => [t, v.toString()]))), unpriced,
    ).run();
  }
  console.log(`[clear-v1-bot-txs] ${pending.length} txs stored`);
}
