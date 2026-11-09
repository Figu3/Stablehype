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
import {
  discoverReserve, loadRegistry, matchPools, parseNewReserve, pollCurvePools, saveDiscovered,
} from "../lib/clear-v1-registry";
import { V1_DEPLOY_BLOCK, V1_STATIC, mergeRegistry, type V1Base } from "@shared/lib/clear-v1-config";

/**
 * Index Clear V1 events into clear_v1_events, and discover new reserves and pools on the way.
 * Unlike the v0.2 syncs, every failure throws: the cursor must not move past
 * data we did not store, and tracked() must record the failure in cron_health.
 *
 * Discovery keeps one invariant: an adopted emitter has every log from its lower bound on,
 * either in this tick's range, in an earlier one, or in a queued backfill job. Discoveries are
 * saved after the rows and before the cursor, so a failed tick redoes them from scratch.
 */

const SYNC_KEY = "clear-v1-events";
const CONFIRMATIONS = 12;
const ADDRESS_BATCH = 31; // lower if RouteMesh rejects the list

async function scan(rpcUrl: string, addresses: string[], from: number, to: number): Promise<RawLog[]> {
  const logs: RawLog[] = [];
  if (to < from || addresses.length === 0) return logs;
  for (let i = 0; i < addresses.length; i += ADDRESS_BATCH) {
    logs.push(...(await rpcGetLogsMulti(rpcUrl, addresses.slice(i, i + ADDRESS_BATCH), from, to)));
  }
  return logs;
}

export async function syncClearV1Events(db: D1Database, rpcUrl: string | null, base: V1Base = V1_STATIC): Promise<void> {
  if (!rpcUrl) throw new Error("[clear-v1-events] ROUTEMESH_RPC_URL missing");

  const stored = await getLastBlock(db, SYNC_KEY);
  const lastBlock = Math.max(stored, V1_DEPLOY_BLOCK - 1);
  const head = await rpcGetTipBlock(rpcUrl);
  const safeTip = head - CONFIRMATIONS;
  const fromBlock = lastBlock + 1;
  const toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_SYNC - 1, safeTip);
  if (toBlock < fromBlock) return;

  const loaded = await loadRegistry(db, base);
  const before = JSON.stringify(loaded.discovered);
  const d = structuredClone(loaded.discovered);
  let reg = loaded.registry;

  const logs = await scan(rpcUrl, reg.emitters, fromBlock, toBlock);
  const adopted: { addresses: string[]; notBefore: number }[] = [];

  // 1. Reserves, from factory logs in this range. Their emitters cannot log before creation.
  const known = new Set(reg.reserves.map((r) => r.address));
  for (const ev of logs.map(parseNewReserve)) {
    if (!ev || known.has(ev.reserve)) continue;
    const found = await discoverReserve(rpcUrl, ev, reg);
    known.add(ev.reserve);
    if (!found) {
      console.warn(`[clear-v1-events] reserve ${ev.reserve} (type ${ev.reserveType}) not auto-described`);
      continue;
    }
    d.reserves.push(found.reserve);
    Object.assign(d.tokens, found.tokens);
    d.feeds.push(...found.feeds);
    reg = mergeRegistry(d, base);
    adopted.push({ addresses: found.emitters, notBefore: found.reserve.createdBlock });
    console.log(`[clear-v1-events] discovered ${found.reserve.label} ${found.reserve.address}`);
  }

  // 2. Pools, after reserves, so a pool for a reserve found above matches in the same tick.
  d.curve = await pollCurvePools(rpcUrl, d.curve, new Set(reg.pools.map((p) => p.address)), head);
  const { matched, rest } = matchPools(d.curve.unmatched, reg.tokens);
  d.curve.unmatched = rest;
  if (matched.length) {
    d.pools.push(...matched);
    reg = mergeRegistry(d, base);
    for (const p of matched) {
      adopted.push({ addresses: [p.address], notBefore: p.notBefore });
      console.log(`[clear-v1-events] discovered pool ${p.label} ${p.address}`);
    }
  }

  // 3. New emitters: this range now, anything older than the range as a backfill job.
  for (const a of adopted) {
    logs.push(...(await scan(rpcUrl, a.addresses, Math.max(a.notBefore, fromBlock), toBlock)));
    if (a.notBefore < fromBlock) d.backfill.push({ addresses: a.addresses, from: a.notBefore, to: fromBlock - 1 });
  }

  // 4. One backfill chunk per tick, so a deep job cannot stall the live range.
  const job = d.backfill[0];
  if (job) {
    const end = Math.min(job.from + MAX_BLOCKS_PER_SYNC - 1, job.to);
    logs.push(...(await scan(rpcUrl, job.addresses, job.from, end)));
    job.from = end + 1;
    if (job.from > job.to) d.backfill.shift();
  }

  const decoded = logs
    .map((log) => ({ log, row: decodeLog(log, reg) }))
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

  if (JSON.stringify(d) !== before) await saveDiscovered(db, d);
  await setLastBlock(db, SYNC_KEY, toBlock);
  console.log(`[clear-v1-events] ${fromBlock}-${toBlock}: ${logs.length} logs, ${decoded.length} stored`);
}
