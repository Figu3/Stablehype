import { getLastBlock, setLastBlock } from "../lib/db";
import { batchFetch, MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";
import {
  rpcGetBlockTimestampStrict,
  rpcGetLogsMulti,
  rpcGetTipBlock,
  rpcGetTxStrict,
  type RawLog,
} from "../lib/rpc";
import { decodeLog } from "../lib/clear-v1-decode";
import { V1_DEPLOY_BLOCK, V1_EMITTERS } from "@shared/lib/clear-v1-config";

/**
 * Index Clear V1 events into clear_v1_events.
 * Unlike the v0.2 syncs, every failure throws: the cursor must not move past
 * data we did not store, and tracked() must record the failure in cron_health.
 */

const SYNC_KEY = "clear-v1-events";
const CONFIRMATIONS = 12;
const ADDRESS_BATCH = 31; // lower if RouteMesh rejects the list

export async function syncClearV1Events(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) throw new Error("[clear-v1-events] ROUTEMESH_RPC_URL missing");

  const stored = await getLastBlock(db, SYNC_KEY);
  const lastBlock = Math.max(stored, V1_DEPLOY_BLOCK - 1);
  const safeTip = (await rpcGetTipBlock(rpcUrl)) - CONFIRMATIONS;
  const fromBlock = lastBlock + 1;
  const toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_SYNC - 1, safeTip);
  if (toBlock < fromBlock) return;

  const logs: RawLog[] = [];
  for (let i = 0; i < V1_EMITTERS.length; i += ADDRESS_BATCH) {
    logs.push(...(await rpcGetLogsMulti(rpcUrl, V1_EMITTERS.slice(i, i + ADDRESS_BATCH), fromBlock, toBlock)));
  }

  const decoded = logs
    .map((log) => ({ log, row: decodeLog(log) }))
    .filter((x): x is { log: RawLog; row: NonNullable<typeof x.row> } => x.row !== null);

  if (decoded.length > 0) {
    const timestamps = new Map<number, number>();
    for (const { log, row } of decoded) {
      if (log.blockTimestamp) timestamps.set(row.block_number, parseInt(log.blockTimestamp, 16));
    }
    const missing = [...new Set(decoded.map((d) => d.row.block_number))].filter((b) => !timestamps.has(b));
    await batchFetch(missing, async (b) => {
      timestamps.set(b, await rpcGetBlockTimestampStrict(rpcUrl, b));
    });

    const txs = new Map<string, { from: string; to: string }>();
    await batchFetch([...new Set(decoded.map((d) => d.row.tx_hash))], async (h) => {
      txs.set(h, await rpcGetTxStrict(rpcUrl, h));
    });

    const stmt = db.prepare(
      `INSERT OR IGNORE INTO clear_v1_events
       (tx_hash, log_index, block_number, timestamp, date, contract, kind, event_name, actor, tx_from, tx_to,
        token_in, token_out, amount_in_raw, amount_out_raw, volume_token, volume_units,
        fee_token, fee_treasury_units, fee_lp_units, fee_trader_units, args_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    const stmts = decoded.map(({ row: r }) => {
      const ts = timestamps.get(r.block_number)!;
      const tx = txs.get(r.tx_hash)!;
      return stmt.bind(
        r.tx_hash, r.log_index, r.block_number, ts, new Date(ts * 1000).toISOString().slice(0, 10),
        r.contract, r.kind, r.event_name, r.actor, tx.from, tx.to,
        r.token_in, r.token_out, r.amount_in_raw, r.amount_out_raw, r.volume_token, r.volume_units,
        r.fee_token, r.fee_treasury_units, r.fee_lp_units, r.fee_trader_units, r.args_json,
      );
    });
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  }

  await setLastBlock(db, SYNC_KEY, toBlock);
  console.log(`[clear-v1-events] ${fromBlock}-${toBlock}: ${logs.length} logs, ${decoded.length} stored`);
}
