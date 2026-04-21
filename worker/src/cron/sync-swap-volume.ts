import { getLastBlock, setLastBlock } from "../lib/db";
import { batchFetch, MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";
import {
  rpcGetTipBlock,
  rpcGetLogs,
  rpcGetBlockTimestamps,
  rpcGetTx,
  rpcGetCode,
} from "../lib/rpc";
import { isAddressUnclassified } from "../lib/clear-address-map";
import { classifyByBytecode } from "@shared/lib/clear-classification";

/**
 * Sync Clear Protocol swap volume from on-chain events.
 * Uses the paid ROUTEMESH RPC for log/tx reads (see sync-rebalance-volume.ts
 * header for why we moved off Etherscan v2).
 * Stores per-transaction rows (clear_swaps) and daily aggregates (swap_volume).
 */

const CLEAR_VAULT = "0x294Cef3Ba0ea16e93F983f8DB86cEC50caED4e9f";
const SWAP_EVENT_TOPIC = "0x532f20306355727dc3dbe3269a79ae1db4dc89b3ede9f89f8225ad4dc03e1be4";

// LiquiditySwapExecuted(address indexed from, address indexed to, address receiver,
//   uint256 amountIn, uint256 tokenAmountOut, uint256 iouAmountOut, uint256 iouTreasuryFee, uint256 iouLpFee)

const TOKEN_DECIMALS: Record<string, number> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,  // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 6,  // USDT
  "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f": 18, // GHO
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": 18, // USDe
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f": 18, // USDS
};

const SYNC_KEY = "clear-swap-volume";
const VAULT_DEPLOY_BLOCK = 21735000;

interface TxDetail {
  from: string;
  to: string;
}

async function fetchTxDetails(
  rpcUrl: string,
  txHashes: string[]
): Promise<Map<string, TxDetail>> {
  const details = new Map<string, TxDetail>();
  await batchFetch(txHashes, async (hash) => {
    const tx = await rpcGetTx(rpcUrl, hash);
    if (tx) details.set(hash, tx);
  }, 5);
  return details;
}

export async function syncSwapVolume(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) {
    console.warn("[swap-volume] No ROUTEMESH_RPC_URL, skipping");
    return;
  }

  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < VAULT_DEPLOY_BLOCK) lastBlock = VAULT_DEPLOY_BLOCK;

  let latestBlock: number;
  try {
    latestBlock = await rpcGetTipBlock(rpcUrl);
  } catch (err) {
    console.warn(`[swap-volume] Tip check failed, not advancing cursor:`, err);
    return;
  }
  if (lastBlock > latestBlock) {
    const rewound = Math.max(latestBlock - 128, VAULT_DEPLOY_BLOCK);
    console.warn(`[swap-volume] Cursor ${lastBlock} is ahead of tip ${latestBlock}, rewinding to ${rewound}`);
    await setLastBlock(db, SYNC_KEY, rewound);
    lastBlock = rewound;
  }

  const fromBlock = lastBlock + 1;
  const toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_SYNC, latestBlock);
  if (toBlock < fromBlock) {
    console.log(`[swap-volume] Cursor already at tip (lastBlock=${lastBlock}, latest=${latestBlock})`);
    return;
  }

  console.log(`[swap-volume] Fetching via RPC, fromBlock=${fromBlock}, toBlock=${toBlock}`);

  let logs;
  try {
    logs = await rpcGetLogs(rpcUrl, CLEAR_VAULT, SWAP_EVENT_TOPIC, fromBlock, toBlock);
  } catch (err) {
    console.warn(`[swap-volume] eth_getLogs failed, not advancing cursor:`, err);
    return;
  }

  if (logs.length >= 1000) {
    console.warn(`[swap-volume] eth_getLogs returned ${logs.length} results — possible silent truncation. Consider reducing MAX_BLOCKS_PER_SYNC.`);
  }

  if (logs.length === 0) {
    const safeTipBlock = latestBlock - 128;
    const newCursor = Math.min(toBlock, safeTipBlock);
    if (newCursor > lastBlock) {
      await setLastBlock(db, SYNC_KEY, newCursor);
      console.log(`[swap-volume] No swaps found, advanced cursor to ${newCursor} (queried ${fromBlock}–${toBlock}, safeTip=${safeTipBlock})`);
    }
    return;
  }

  const uniqueBlockNumbers = logs.map((l) => l.blockNumber);
  const uniqueHashes = [...new Set(logs.map((l) => l.transactionHash))];

  const [blockTimestamps, txDetails] = await Promise.all([
    rpcGetBlockTimestamps(rpcUrl, uniqueBlockNumbers),
    fetchTxDetails(rpcUrl, uniqueHashes),
  ]);
  console.log(`[swap-volume] Fetched ${blockTimestamps.size} block timestamps, ${txDetails.size}/${uniqueHashes.length} tx details`);

  const dateMap = new Map<string, { volumeUSD: number; swapCount: number }>();
  let maxBlock = lastBlock;
  const txStmts: D1PreparedStatement[] = [];

  for (const log of logs) {
    const blockNum = log.blockNumber;
    if (blockNum > maxBlock) maxBlock = blockNum;

    const ts = blockTimestamps.get(blockNum);
    if (ts === undefined) {
      console.warn(`[swap-volume] No timestamp for block ${blockNum}, skipping log`);
      continue;
    }
    const date = new Date(ts * 1000).toISOString().split("T")[0];
    const txHash = log.transactionHash;

    // Indexed: topic1 = tokenIn, topic2 = tokenOut
    const tokenIn = "0x" + (log.topics[1]?.slice(26) ?? "").toLowerCase();
    const tokenOut = "0x" + (log.topics[2]?.slice(26) ?? "").toLowerCase();

    // Data: receiver (word0), amountIn (word1), tokenAmountOut (word2),
    //       iouAmountOut (word3), iouTreasuryFee (word4), iouLpFee (word5)
    const data = log.data.slice(2);
    const receiver = "0x" + data.slice(24, 64).toLowerCase();
    const amountInRaw = BigInt("0x" + data.slice(64, 128));
    const amountOutRaw = BigInt("0x" + data.slice(128, 192));
    const iouAmountOutRaw = BigInt("0x" + data.slice(192, 256));
    const iouTreasuryFeeRaw = BigInt("0x" + data.slice(256, 320));
    const iouLpFeeRaw = BigInt("0x" + data.slice(320, 384));

    const decimalsIn = TOKEN_DECIMALS[tokenIn] ?? 18;
    const decimalsOut = TOKEN_DECIMALS[tokenOut] ?? 18;
    const amountInUsd = Number(amountInRaw) / 10 ** decimalsIn;
    const amountOutUsd = Number(amountOutRaw) / 10 ** decimalsOut;

    const detail = txDetails.get(txHash);
    const txFrom = detail?.from ?? null;
    const txTo = detail?.to ?? null;

    txStmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO clear_swaps
         (tx_hash, block_number, timestamp, date, token_in, token_out, receiver,
          amount_in_raw, amount_in_usd, amount_out_raw, amount_out_usd,
          iou_amount_out_raw, iou_treasury_fee_raw, iou_lp_fee_raw,
          tx_from, tx_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        txHash, blockNum, ts, date, tokenIn, tokenOut, receiver,
        amountInRaw.toString(), amountInUsd,
        amountOutRaw.toString(), amountOutUsd,
        iouAmountOutRaw.toString(), iouTreasuryFeeRaw.toString(), iouLpFeeRaw.toString(),
        txFrom, txTo
      )
    );

    const entry = dateMap.get(date) ?? { volumeUSD: 0, swapCount: 0 };
    entry.volumeUSD += amountInUsd;
    entry.swapCount += 1;
    dateMap.set(date, entry);
  }

  const allStmts: D1PreparedStatement[] = [...txStmts];

  if (dateMap.size > 0) {
    const now = Math.floor(Date.now() / 1000);
    for (const [date, { volumeUSD, swapCount }] of dateMap) {
      allStmts.push(
        db.prepare(
          `INSERT INTO swap_volume (date, volume_usd, swap_count, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET
             volume_usd = swap_volume.volume_usd + excluded.volume_usd,
             swap_count = swap_volume.swap_count + excluded.swap_count,
             updated_at = excluded.updated_at`
        ).bind(date, volumeUSD, swapCount, now)
      );
    }
  }

  await db.batch(allStmts);
  await setLastBlock(db, SYNC_KEY, maxBlock);
  console.log(`[swap-volume] Synced ${logs.length} swaps across ${dateMap.size} days, up to block ${maxBlock}`);

  await backfillMissingTxDetails(db, rpcUrl);
  await classifyUnknownAddresses(db, rpcUrl);
}

/**
 * For every tx.to that's neither in the static SWAP_TO_MAP nor already
 * classified in address_classification, fetch its bytecode once and run it
 * through classifyByBytecode. Caches the result so the API can merge it with
 * the static map. Rate-limited to MAX_PER_TICK addresses per cron run.
 */
const MAX_CLASSIFY_PER_TICK = 20;
async function classifyUnknownAddresses(db: D1Database, rpcUrl: string): Promise<void> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT LOWER(tx_to) AS addr FROM clear_swaps
       WHERE tx_to IS NOT NULL
         AND LOWER(tx_to) NOT IN (SELECT address FROM address_classification)
       ORDER BY timestamp DESC
       LIMIT 200`,
    )
    .all<{ addr: string }>();

  const candidates = (rows.results ?? [])
    .map((r) => r.addr)
    .filter((a) => isAddressUnclassified(a))
    .slice(0, MAX_CLASSIFY_PER_TICK);

  if (candidates.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  const stmts: D1PreparedStatement[] = [];
  let hits = 0;

  for (const addr of candidates) {
    const code = await rpcGetCode(rpcUrl, addr);
    if (!code || code === "0x") continue;
    const result = classifyByBytecode(code);
    if (!result) continue;
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO address_classification (address, source, detection, discovered_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(addr, result.source, result.detection, now),
    );
    hits++;
  }

  if (stmts.length > 0) await db.batch(stmts);
  console.log(`[swap-volume] Bytecode-classified ${hits}/${candidates.length} unknown addresses`);
}

async function backfillMissingTxDetails(db: D1Database, rpcUrl: string): Promise<void> {
  const nullRows = await db
    .prepare("SELECT DISTINCT tx_hash FROM clear_swaps WHERE tx_from IS NULL LIMIT 20")
    .all<{ tx_hash: string }>();

  const hashes = (nullRows.results ?? []).map((r) => r.tx_hash);
  if (hashes.length === 0) return;

  console.log(`[swap-volume] Backfilling tx details for ${hashes.length} rows`);

  const details = await fetchTxDetails(rpcUrl, hashes);

  const stmts: D1PreparedStatement[] = [];
  for (const [hash, { from, to }] of details) {
    stmts.push(
      db.prepare("UPDATE clear_swaps SET tx_from = ?, tx_to = ? WHERE tx_hash = ? AND tx_from IS NULL")
        .bind(from, to, hash)
    );
  }
  if (stmts.length > 0) {
    await db.batch(stmts);
    console.log(`[swap-volume] Backfilled ${details.size}/${hashes.length} tx details`);
  }
}
