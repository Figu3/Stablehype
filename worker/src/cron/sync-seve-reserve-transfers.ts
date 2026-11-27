import { getLastBlock, setLastBlock } from "../lib/db";
import { MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";
import { loadRegistry } from "../lib/clear-v1-registry";
import { rpcGetTipBlock, rpcGetTransfers, type RawLog } from "../lib/rpc";
import { SEVE_SAFES, V1_DEPLOY_BLOCK } from "@shared/lib/clear-v1-config";
import { stablecoinsOf } from "./sync-seve-transfers";
import { shareValue } from "../api/seve-lp";

/**
 * Index every stablecoin transfer between Sève's Safes and the Clear reserves, into
 * seve_reserve_transfers. Any failure throws before the cursor moves.
 */

const SYNC_KEY = "seve-reserve-transfers";
const CONFIRMATIONS = 12;
/** Chunks of MAX_BLOCKS_PER_SYNC read per tick, four log scans each. Backfills from the V1 deploy block in a few ticks. */
const CHUNKS_PER_TICK = 20;

const party = (topic: string) => "0x" + topic.slice(26).toLowerCase();

export async function syncSeveReserveTransfers(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) throw new Error("[seve-reserve-transfers] ROUTEMESH_RPC_URL missing");
  const { registry } = await loadRegistry(db);
  const reserves = new Set(registry.reserves.map((r) => r.address));
  const tokens = stablecoinsOf(registry);

  const head = (await rpcGetTipBlock(rpcUrl)) - CONFIRMATIONS;
  const from = Math.max(await getLastBlock(db, SYNC_KEY), V1_DEPLOY_BLOCK - 1) + 1;
  const to = Math.min(head, from + CHUNKS_PER_TICK * MAX_BLOCKS_PER_SYNC - 1);
  if (to < from) return;

  const rows: { log: RawLog; direction: "out" | "in" }[] = [];
  for (let start = from; start <= to; start += MAX_BLOCKS_PER_SYNC) {
    const end = Math.min(to, start + MAX_BLOCKS_PER_SYNC - 1);
    const scans = await Promise.all(SEVE_SAFES.flatMap((s) => [
      rpcGetTransfers(rpcUrl, tokens, s.address, null, start, end),
      rpcGetTransfers(rpcUrl, tokens, null, s.address, start, end),
    ]));
    scans.forEach((logs, i) => {
      const direction = i % 2 === 0 ? "out" : "in";
      for (const log of logs) {
        if (reserves.has(party(log.topics[direction === "out" ? 2 : 1]))) rows.push({ log, direction });
      }
    });
  }

  if (rows.length > 0) {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO seve_reserve_transfers (tx_hash, log_index, block_number, token, direction, amount_raw)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    await db.batch(rows.map(({ log, direction }) => stmt.bind(
      log.transactionHash, parseInt(log.logIndex, 16), parseInt(log.blockNumber, 16),
      log.address.toLowerCase(), direction, BigInt(log.data).toString(),
    )));
  }
  await setLastBlock(db, SYNC_KEY, to);
}

const SHARES_KEY = "seve-share-transfers";
const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Index reserve shares moved between Sève's Safes and an address outside Sève and the reserves
 * into seve_share_transfers, each valued in stablecoins at its block (an archive read). Mints,
 * burns and moves between the two Safes stay out: deposits and withdrawals are counted from the
 * stablecoins. On 26 Nov 2026 the Borrower Safe sent all its meta shares to Safe 0xd884…5016.
 */
export async function syncSeveShareTransfers(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) throw new Error("[seve-share-transfers] ROUTEMESH_RPC_URL missing");
  const { registry } = await loadRegistry(db);
  const reserves = registry.reserves.map((r) => r.address);
  const skip = new Set([ZERO, ...reserves, ...SEVE_SAFES.map((s) => s.address)]);

  const head = (await rpcGetTipBlock(rpcUrl)) - CONFIRMATIONS;
  const from = Math.max(await getLastBlock(db, SHARES_KEY), V1_DEPLOY_BLOCK - 1) + 1;
  const to = Math.min(head, from + CHUNKS_PER_TICK * MAX_BLOCKS_PER_SYNC - 1);
  if (to < from) return;

  const rows: { log: RawLog; direction: "out" | "in"; counterparty: string }[] = [];
  for (let start = from; start <= to; start += MAX_BLOCKS_PER_SYNC) {
    const end = Math.min(to, start + MAX_BLOCKS_PER_SYNC - 1);
    const scans = await Promise.all(SEVE_SAFES.flatMap((s) => [
      rpcGetTransfers(rpcUrl, reserves, s.address, null, start, end),
      rpcGetTransfers(rpcUrl, reserves, null, s.address, start, end),
    ]));
    scans.forEach((logs, i) => {
      const direction = i % 2 === 0 ? "out" : "in";
      for (const log of logs) {
        const counterparty = party(log.topics[direction === "out" ? 2 : 1]);
        if (!skip.has(counterparty)) rows.push({ log, direction, counterparty });
      }
    });
  }

  if (rows.length > 0) {
    const decimals = (t: string) => registry.tokens[t]?.decimals ?? 18;
    const valued = await Promise.all(rows.map(async (r) => {
      const reserve = r.log.address.toLowerCase();
      const block = parseInt(r.log.blockNumber, 16);
      const shares = Number(BigInt(r.log.data)) / 10 ** decimals(reserve);
      // Read at the block before, so the transfer itself cannot move what the shares are worth.
      return { ...r, reserve, block, value: await shareValue(rpcUrl, registry, reserve, shares, block - 1) };
    }));
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO seve_share_transfers
       (tx_hash, log_index, block_number, reserve, counterparty, direction, shares_raw, value_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await db.batch(valued.map((r) => stmt.bind(
      r.log.transactionHash, parseInt(r.log.logIndex, 16), r.block, r.reserve, r.counterparty,
      r.direction, BigInt(r.log.data).toString(), JSON.stringify(r.value),
    )));
  }
  await setLastBlock(db, SHARES_KEY, to);
}
