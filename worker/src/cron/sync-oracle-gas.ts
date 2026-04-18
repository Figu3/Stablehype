import { getLastBlock, setLastBlock } from "../lib/db";
import { batchFetch, MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";
import {
  rpcGetTipBlock,
  rpcGetLogs,
  rpcGetBlockTimestamps,
  rpcGetReceipt,
  fetchEthPrice,
} from "../lib/rpc";

/**
 * Sync oracle keeper gas costs from ClearOracleRateChanged events.
 * Uses the paid ROUTEMESH RPC for log/receipt reads.
 * Stores per-transaction gas data in clear_oracle_txs table.
 */

const ORACLE_KEEPER = "0x6ac07769cd6b502479397e36a14b8534202df582";
const CLEAR_ORACLE_V02 = "0xFb31c9Fe8d2D02AC04379ab2Cc6e840ede2e613C";
const CLEAR_ORACLE_V01 = "0x049ad7Ff0c6BdbaB86baf4b1A5a5cA975e234FCA";
const RATE_CHANGED_TOPIC = "0x6b6a5ce1bc50d5256cab83f2efe0c82480da7a47f1541515335194a7f144616e";

const SYNC_KEY = "clear-oracle-gas";
const ORACLE_DEPLOY_BLOCK = 21400000; // v0.1 deploy era

export async function syncOracleGas(
  db: D1Database,
  rpcUrl: string | null,
  etherscanKey: string | null
): Promise<void> {
  if (!rpcUrl) {
    console.warn("[oracle-gas] No ROUTEMESH_RPC_URL, skipping");
    return;
  }

  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < ORACLE_DEPLOY_BLOCK) lastBlock = ORACLE_DEPLOY_BLOCK;

  let latestBlock: number;
  try {
    latestBlock = await rpcGetTipBlock(rpcUrl);
  } catch (err) {
    console.warn(`[oracle-gas] Tip check failed, not advancing cursor:`, err);
    return;
  }

  const ethPrice = await fetchEthPrice(etherscanKey);
  console.log(`[oracle-gas] ETH price: $${ethPrice ?? "N/A"}`);

  let totalNew = 0;
  let maxBlock = lastBlock;
  const fromBlock = lastBlock + 1;
  const toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_SYNC, latestBlock);

  if (toBlock < fromBlock) {
    console.log(`[oracle-gas] Cursor already at tip (lastBlock=${lastBlock}, latest=${latestBlock})`);
    return;
  }

  // Dedupe by tx hash across both oracle versions (one tx can update multiple oracles)
  const txMap = new Map<string, { blockNum: number }>();

  for (const oracleAddr of [CLEAR_ORACLE_V02, CLEAR_ORACLE_V01]) {
    let logs;
    try {
      logs = await rpcGetLogs(rpcUrl, oracleAddr, RATE_CHANGED_TOPIC, fromBlock, toBlock);
    } catch (err) {
      console.warn(`[oracle-gas] eth_getLogs(${oracleAddr}) failed, not advancing cursor:`, err);
      return;
    }

    if (logs.length >= 1000) {
      console.warn(`[oracle-gas] getLogs for ${oracleAddr} returned ${logs.length} results — possible silent truncation.`);
    }

    for (const log of logs) {
      if (log.blockNumber > maxBlock) maxBlock = log.blockNumber;
      if (!txMap.has(log.transactionHash)) {
        txMap.set(log.transactionHash, { blockNum: log.blockNumber });
      }
    }
  }

  if (txMap.size === 0) {
    // Advance cursor to queried range (capped at tip-128) when nothing found.
    const safeTip = latestBlock - 128;
    const newCursor = Math.min(toBlock, safeTip);
    if (newCursor > lastBlock) {
      await setLastBlock(db, SYNC_KEY, newCursor);
      console.log(`[oracle-gas] No oracle txs found, advanced cursor to ${newCursor} (queried ${fromBlock}–${toBlock})`);
    }
    return;
  }

  const blockNumbers = [...txMap.values()].map((v) => v.blockNum);
  const blockTimestamps = await rpcGetBlockTimestamps(rpcUrl, blockNumbers);

  const stmts: D1PreparedStatement[] = [];
  const txEntries = [...txMap.entries()];

  await batchFetch(txEntries, async ([txHash, { blockNum }]) => {
    const receipt = await rpcGetReceipt(rpcUrl, txHash);
    if (!receipt) return;
    // Only count txs from the oracle keeper
    if (receipt.from !== ORACLE_KEEPER) return;

    const ts = blockTimestamps.get(blockNum);
    if (ts === undefined) return;

    const gasCostEth = (receipt.gasUsed * receipt.effectiveGasPrice) / 1e18;
    const gasPriceGwei = receipt.effectiveGasPrice / 1e9;
    const gasCostUsd = ethPrice !== null ? gasCostEth * ethPrice : null;
    const date = new Date(ts * 1000).toISOString().split("T")[0];

    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO clear_oracle_txs
           (tx_hash, block_number, timestamp, date, gas_used, gas_price_gwei, gas_cost_eth, gas_cost_usd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(txHash, blockNum, ts, date, receipt.gasUsed, gasPriceGwei, gasCostEth, gasCostUsd)
    );
  }, 5);

  if (stmts.length > 0) {
    await db.batch(stmts);
    totalNew += stmts.length;
  }

  if (maxBlock > lastBlock) {
    await setLastBlock(db, SYNC_KEY, maxBlock);
  }
  console.log(`[oracle-gas] Synced ${totalNew} oracle txs, up to block ${maxBlock}`);
}
