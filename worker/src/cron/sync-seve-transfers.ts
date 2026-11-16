import { getLastBlock, setLastBlock } from "../lib/db";
import { batchFetch, MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";
import { loadRegistry } from "../lib/clear-v1-registry";
import { rpcGetBlockTimestampStrict, rpcGetTipBlock, rpcGetTransfers, type RawLog } from "../lib/rpc";
import { SEVE_SAFES, V1_DEPLOY_BLOCK, type V1Registry } from "@shared/lib/clear-v1-config";

/**
 * Index what Sève's Rebalancer Safe sends to issuers and gets back, into seve_transfers.
 * A transfer to or from a Clear reserve is a rebalance leg and one with the Borrower Safe is
 * internal: neither is stored. Like the V1 events sync, any failure throws before the cursor moves.
 */

const SYNC_KEY = "seve-transfers";
const CONFIRMATIONS = 12;
/** Chunks of MAX_BLOCKS_PER_SYNC read per tick, two log scans each. Enough to backfill from the V1 deploy block in one tick. */
const CHUNKS_PER_TICK = 40;
const [BORROWER, REBALANCER] = SEVE_SAFES.map((s) => s.address);

/** The stablecoins the reserves trade: every leg that is not itself a reserve share. */
export function stablecoinsOf(registry: Pick<V1Registry, "reserves">): string[] {
  const reserves = new Set(registry.reserves.map((r) => r.address));
  return [...new Set(registry.reserves.flatMap((r) => r.legs))].filter((t) => !reserves.has(t));
}

const party = (topic: string) => "0x" + topic.slice(26).toLowerCase();

export async function syncSeveTransfers(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) throw new Error("[seve-transfers] ROUTEMESH_RPC_URL missing");
  const { registry } = await loadRegistry(db);
  const reserves = new Set(registry.reserves.map((r) => r.address));
  const tokens = stablecoinsOf(registry);
  const outside = (address: string) => !reserves.has(address) && address !== BORROWER;

  const head = (await rpcGetTipBlock(rpcUrl)) - CONFIRMATIONS;
  const from = Math.max(await getLastBlock(db, SYNC_KEY), V1_DEPLOY_BLOCK - 1) + 1;
  const to = Math.min(head, from + CHUNKS_PER_TICK * MAX_BLOCKS_PER_SYNC - 1);
  if (to < from) return;

  const rows: { log: RawLog; direction: "out" | "in"; counterparty: string }[] = [];
  for (let start = from; start <= to; start += MAX_BLOCKS_PER_SYNC) {
    const end = Math.min(to, start + MAX_BLOCKS_PER_SYNC - 1);
    const [sent, received] = await Promise.all([
      rpcGetTransfers(rpcUrl, tokens, REBALANCER, null, start, end),
      rpcGetTransfers(rpcUrl, tokens, null, REBALANCER, start, end),
    ]);
    for (const log of sent) rows.push({ log, direction: "out", counterparty: party(log.topics[2]) });
    for (const log of received) rows.push({ log, direction: "in", counterparty: party(log.topics[1]) });
  }
  const kept = rows.filter((r) => outside(r.counterparty));

  if (kept.length > 0) {
    const timestamps = new Map<number, number>();
    for (const { log } of kept) {
      if (log.blockTimestamp) timestamps.set(parseInt(log.blockNumber, 16), parseInt(log.blockTimestamp, 16));
    }
    const missing = [...new Set(kept.map((r) => parseInt(r.log.blockNumber, 16)))].filter((b) => !timestamps.has(b));
    await batchFetch(missing, async (b) => {
      timestamps.set(b, await rpcGetBlockTimestampStrict(rpcUrl, b));
    });
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO seve_transfers
       (tx_hash, log_index, block_number, timestamp, token, direction, counterparty, amount_raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await db.batch(kept.map(({ log, direction, counterparty }) => {
      const block = parseInt(log.blockNumber, 16);
      return stmt.bind(
        log.transactionHash, parseInt(log.logIndex, 16), block, timestamps.get(block)!,
        log.address.toLowerCase(), direction, counterparty, BigInt(log.data).toString(),
      );
    }));
  }
  await setLastBlock(db, SYNC_KEY, to);
}
