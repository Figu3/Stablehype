import { getLastBlock, setLastBlock } from "../lib/db";
import { batchFetch, MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";
import {
  rpcGetTipBlock,
  rpcGetLogs,
  rpcGetBlockTimestamps,
  rpcGetTx,
  rpcGetReceipt,
  fetchEthPrice,
} from "../lib/rpc";

/**
 * Sync Clear Protocol rebalance volume from on-chain events.
 * Uses the paid ROUTEMESH RPC for log/tx/receipt reads (Etherscan free tier
 * 3 req/s cap was causing silent cursor stalls when multiple syncs fired on
 * the same cron tick). Etherscan is still used for ETH/USD price (1 call/run).
 * Stores per-transaction rows (clear_rebalances) and daily aggregates
 * (rebalance_volume).
 */

const CLEAR_VAULT = "0x294Cef3Ba0ea16e93F983f8DB86cEC50caED4e9f";
const REBALANCE_EVENT_TOPIC = "0x3709543b275c855b8c7e1ef76d05540d1b71197781be66cc691d228217acd7c8";

// LiquidityRebalanceExecuted(address from, address to, uint256 amountIn, uint256 amountOut)
// All fields are in data (none indexed besides topic0)

const TOKEN_DECIMALS: Record<string, number> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,  // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 6,  // USDT
  "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f": 18, // GHO
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": 18, // USDe
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f": 18, // USDS
};

const SYNC_KEY = "clear-rebalance-volume";
const VAULT_DEPLOY_BLOCK = 21735000;

interface TxDetail {
  from: string;
  to: string;
  gasUsed: number | null;
  gasPriceGwei: number | null;
  gasCostEth: number | null;
}

async function fetchTxDetails(
  rpcUrl: string,
  txHashes: string[]
): Promise<Map<string, TxDetail>> {
  const details = new Map<string, TxDetail>();
  await batchFetch(txHashes, async (hash) => {
    const [tx, receipt] = await Promise.all([
      rpcGetTx(rpcUrl, hash),
      rpcGetReceipt(rpcUrl, hash),
    ]);
    if (!tx) return;
    let gasUsed: number | null = null;
    let gasPriceGwei: number | null = null;
    let gasCostEth: number | null = null;
    if (receipt) {
      gasUsed = receipt.gasUsed;
      gasPriceGwei = receipt.effectiveGasPrice / 1e9;
      gasCostEth = (receipt.gasUsed * receipt.effectiveGasPrice) / 1e18;
    }
    details.set(hash, { from: tx.from, to: tx.to, gasUsed, gasPriceGwei, gasCostEth });
  }, 3);
  return details;
}

export async function syncRebalanceVolume(
  db: D1Database,
  rpcUrl: string | null,
  etherscanKey: string | null
): Promise<void> {
  if (!rpcUrl) {
    console.warn("[rebalance-volume] No ROUTEMESH_RPC_URL, skipping");
    return;
  }

  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < VAULT_DEPLOY_BLOCK) lastBlock = VAULT_DEPLOY_BLOCK;

  // Safety: if the cursor is ahead of the chain tip (e.g. from a past bug),
  // rewind to latestBlock-128 so we re-sync recent events.
  let latestBlock: number;
  try {
    latestBlock = await rpcGetTipBlock(rpcUrl);
  } catch (err) {
    console.warn(`[rebalance-volume] Tip check failed, not advancing cursor:`, err);
    return;
  }
  if (lastBlock > latestBlock) {
    const rewound = Math.max(latestBlock - 128, VAULT_DEPLOY_BLOCK);
    console.warn(`[rebalance-volume] Cursor ${lastBlock} is ahead of tip ${latestBlock}, rewinding to ${rewound}`);
    await setLastBlock(db, SYNC_KEY, rewound);
    lastBlock = rewound;
  }

  const fromBlock = lastBlock + 1;
  const toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_SYNC, latestBlock);
  if (toBlock < fromBlock) {
    console.log(`[rebalance-volume] Cursor already at tip (lastBlock=${lastBlock}, latest=${latestBlock})`);
    return;
  }

  console.log(`[rebalance-volume] Fetching via RPC, fromBlock=${fromBlock}, toBlock=${toBlock}`);

  let logs;
  try {
    logs = await rpcGetLogs(rpcUrl, CLEAR_VAULT, REBALANCE_EVENT_TOPIC, fromBlock, toBlock);
  } catch (err) {
    console.warn(`[rebalance-volume] eth_getLogs failed, not advancing cursor:`, err);
    return;
  }

  if (logs.length >= 1000) {
    console.warn(`[rebalance-volume] eth_getLogs returned ${logs.length} results — possible silent truncation. Consider reducing MAX_BLOCKS_PER_SYNC.`);
  }

  if (logs.length === 0) {
    // Advance cursor, capped 128 blocks behind tip (re-org safety buffer).
    const safeTipBlock = latestBlock - 128;
    const newCursor = Math.min(toBlock, safeTipBlock);
    if (newCursor > lastBlock) {
      await setLastBlock(db, SYNC_KEY, newCursor);
      console.log(`[rebalance-volume] No rebalances found, advanced cursor to ${newCursor} (queried ${fromBlock}–${toBlock}, safeTip=${safeTipBlock})`);
    }
    return;
  }

  const uniqueBlockNumbers = logs.map((l) => l.blockNumber);
  const uniqueHashes = [...new Set(logs.map((l) => l.transactionHash))];

  const [blockTimestamps, txDetails, ethPrice] = await Promise.all([
    rpcGetBlockTimestamps(rpcUrl, uniqueBlockNumbers),
    fetchTxDetails(rpcUrl, uniqueHashes),
    fetchEthPrice(etherscanKey),
  ]);
  console.log(`[rebalance-volume] Fetched ${blockTimestamps.size} block timestamps, ${txDetails.size}/${uniqueHashes.length} tx details, ETH price: $${ethPrice ?? "N/A"}`);

  const dateMap = new Map<string, { volumeUSD: number; rebalanceCount: number }>();
  let maxBlock = lastBlock;
  const txStmts: D1PreparedStatement[] = [];

  for (const log of logs) {
    const blockNum = log.blockNumber;
    if (blockNum > maxBlock) maxBlock = blockNum;

    const ts = blockTimestamps.get(blockNum);
    if (ts === undefined) {
      console.warn(`[rebalance-volume] No timestamp for block ${blockNum}, skipping log`);
      continue;
    }
    const date = new Date(ts * 1000).toISOString().split("T")[0];
    const txHash = log.transactionHash;

    // Data layout: from (address word0), to (address word1), amountIn (word2), amountOut (word3)
    const data = log.data.slice(2);
    const tokenIn = "0x" + data.slice(24, 64).toLowerCase();
    const tokenOut = "0x" + data.slice(88, 128).toLowerCase();
    const amountInRaw = BigInt("0x" + data.slice(128, 192));
    const amountOutRaw = BigInt("0x" + data.slice(192, 256));

    const decimalsIn = TOKEN_DECIMALS[tokenIn] ?? 18;
    const decimalsOut = TOKEN_DECIMALS[tokenOut] ?? 18;
    const amountInUsd = Number(amountInRaw) / 10 ** decimalsIn;
    const amountOutUsd = Number(amountOutRaw) / 10 ** decimalsOut;

    const detail = txDetails.get(txHash);
    const txFrom = detail?.from ?? null;
    const txTo = detail?.to ?? null;
    const gasUsed = detail?.gasUsed ?? null;
    const gasPriceGwei = detail?.gasPriceGwei ?? null;
    const gasCostEth = detail?.gasCostEth ?? null;
    const gasCostUsd = gasCostEth !== null && ethPrice !== null ? gasCostEth * ethPrice : null;
    txStmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO clear_rebalances
         (tx_hash, block_number, timestamp, date, token_in, token_out,
          amount_in_raw, amount_in_usd, amount_out_raw, amount_out_usd,
          tx_from, tx_to, gas_used, gas_price_gwei, gas_cost_eth, gas_cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        txHash, blockNum, ts, date, tokenIn, tokenOut,
        amountInRaw.toString(), amountInUsd,
        amountOutRaw.toString(), amountOutUsd,
        txFrom, txTo, gasUsed, gasPriceGwei, gasCostEth, gasCostUsd
      )
    );

    const entry = dateMap.get(date) ?? { volumeUSD: 0, rebalanceCount: 0 };
    entry.volumeUSD += amountInUsd;
    entry.rebalanceCount += 1;
    dateMap.set(date, entry);
  }

  const allStmts: D1PreparedStatement[] = [...txStmts];

  if (dateMap.size > 0) {
    const now = Math.floor(Date.now() / 1000);
    for (const [date, { volumeUSD, rebalanceCount }] of dateMap) {
      allStmts.push(
        db.prepare(
          `INSERT INTO rebalance_volume (date, volume_usd, rebalance_count, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET
             volume_usd = rebalance_volume.volume_usd + excluded.volume_usd,
             rebalance_count = rebalance_volume.rebalance_count + excluded.rebalance_count,
             updated_at = excluded.updated_at`
        ).bind(date, volumeUSD, rebalanceCount, now)
      );
    }
  }

  await db.batch(allStmts);
  await setLastBlock(db, SYNC_KEY, maxBlock);
  console.log(`[rebalance-volume] Synced ${logs.length} rebalances across ${dateMap.size} days, up to block ${maxBlock}`);
}
