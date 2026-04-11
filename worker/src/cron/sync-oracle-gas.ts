import { getLastBlock, setLastBlock } from "../lib/db";
import { batchFetch, MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";

/**
 * Sync oracle keeper gas costs from ClearOracleRateChanged events.
 * Stores per-transaction gas data in clear_oracle_txs table.
 * Runs on the same cron as rebalance volume sync (every 15 min).
 */

const ORACLE_KEEPER = "0x6ac07769cd6b502479397e36a14b8534202df582";
const CLEAR_ORACLE_V02 = "0xFb31c9Fe8d2D02AC04379ab2Cc6e840ede2e613C";
const CLEAR_ORACLE_V01 = "0x049ad7Ff0c6BdbaB86baf4b1A5a5cA975e234FCA";
const RATE_CHANGED_TOPIC = "0x6b6a5ce1bc50d5256cab83f2efe0c82480da7a47f1541515335194a7f144616e";

const SYNC_KEY = "clear-oracle-gas";
const ORACLE_DEPLOY_BLOCK = 21400000; // v0.1 deploy era

interface EtherscanLogEntry {
  blockNumber: string;
  timeStamp: string;
  transactionHash: string;
}

async function fetchEthPrice(etherscanKey: string): Promise<number | null> {
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=stats&action=ethprice&apikey=${etherscanKey}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { result?: { ethusd?: string } };
    const price = parseFloat(json.result?.ethusd ?? "");
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

async function fetchReceipt(
  txHash: string,
  etherscanKey: string
): Promise<{ gasUsed: number; gasPriceGwei: number; gasCostEth: number } | null> {
  try {
    const resp = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionReceipt` +
        `&txhash=${txHash}&apikey=${etherscanKey}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      result?: { gasUsed?: string; effectiveGasPrice?: string; from?: string };
    };
    const r = json.result;
    if (!r?.gasUsed || !r?.effectiveGasPrice) return null;
    // Only count txs from the oracle keeper
    if (r.from && r.from.toLowerCase() !== ORACLE_KEEPER) return null;
    const gasUsed = parseInt(r.gasUsed, 16);
    const effPrice = parseInt(r.effectiveGasPrice, 16);
    return {
      gasUsed,
      gasPriceGwei: effPrice / 1e9,
      gasCostEth: (gasUsed * effPrice) / 1e18,
    };
  } catch {
    return null;
  }
}

export async function syncOracleGas(db: D1Database, etherscanKey: string | null): Promise<void> {
  if (!etherscanKey) {
    console.warn("[oracle-gas] No ETHERSCAN_API_KEY, skipping");
    return;
  }

  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < ORACLE_DEPLOY_BLOCK) lastBlock = ORACLE_DEPLOY_BLOCK;

  const ethPrice = await fetchEthPrice(etherscanKey);
  console.log(`[oracle-gas] ETH price: $${ethPrice ?? "N/A"}`);

  let totalNew = 0;
  let maxBlock = lastBlock;

  for (const oracleAddr of [CLEAR_ORACLE_V02, CLEAR_ORACLE_V01]) {
    const fromBlock = lastBlock + 1;
    const toBlock = fromBlock + MAX_BLOCKS_PER_SYNC;
    const url =
      `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs` +
      `&address=${oracleAddr}` +
      `&topic0=${RATE_CHANGED_TOPIC}` +
      `&fromBlock=${fromBlock}` +
      `&toBlock=${toBlock}` +
      `&apikey=${etherscanKey}`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) continue;

    const json = (await resp.json()) as {
      status: string;
      result: EtherscanLogEntry[] | string;
    };
    if (!Array.isArray(json.result)) continue;

    if (json.result.length >= 1000) {
      console.warn(`[oracle-gas] getLogs for ${oracleAddr} returned ${json.result.length} results — possible silent truncation.`);
    }

    // Deduplicate by tx hash (one tx can update multiple oracle prices)
    const txMap = new Map<string, { blockNum: number; ts: number }>();
    for (const log of json.result) {
      const blockNum = parseInt(log.blockNumber, 16);
      if (blockNum > maxBlock) maxBlock = blockNum;
      const ts = parseInt(log.timeStamp, 16);
      if (!txMap.has(log.transactionHash)) {
        txMap.set(log.transactionHash, { blockNum, ts });
      }
    }

    const stmts: D1PreparedStatement[] = [];
    const txEntries = [...txMap.entries()];

    await batchFetch(txEntries, async ([txHash, { blockNum, ts }]) => {
      const receipt = await fetchReceipt(txHash, etherscanKey);
      if (!receipt) return;

      const date = new Date(ts * 1000).toISOString().split("T")[0];
      const gasCostUsd = ethPrice !== null ? receipt.gasCostEth * ethPrice : null;

      stmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO clear_oracle_txs
             (tx_hash, block_number, timestamp, date, gas_used, gas_price_gwei, gas_cost_eth, gas_cost_usd)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            txHash, blockNum, ts, date,
            receipt.gasUsed, receipt.gasPriceGwei, receipt.gasCostEth, gasCostUsd
          )
      );
    }, 5);

    if (stmts.length > 0) {
      await db.batch(stmts);
      totalNew += stmts.length;
    }
  }

  // Advance cursor even if no new events
  if (maxBlock <= lastBlock) {
    try {
      const blockResp = await fetch(
        `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${etherscanKey}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (blockResp.ok) {
        const blockJson = (await blockResp.json()) as { result: string };
        const latest = parseInt(blockJson.result, 16);
        if (!isNaN(latest) && latest > lastBlock) maxBlock = latest;
      }
    } catch { /* ignore */ }
  }

  if (maxBlock > lastBlock) {
    await setLastBlock(db, SYNC_KEY, maxBlock);
  }
  console.log(`[oracle-gas] Synced ${totalNew} oracle txs, up to block ${maxBlock}`);
}
