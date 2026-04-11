import { getLastBlock, setLastBlock } from "../lib/db";
import { batchFetch, MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";

/**
 * Sync Clear Protocol rebalance volume from on-chain events.
 * Uses Etherscan v2 getLogs API (same pattern as swap volume sync).
 * Stores both per-transaction rows (clear_rebalances) and daily aggregates (rebalance_volume).
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

interface EtherscanLogEntry {
  blockNumber: string;
  timeStamp: string;
  transactionHash: string;
  topics: string[];
  data: string;
}

interface TxDetail {
  from: string;
  to: string;
  gasUsed: number | null;
  gasPriceGwei: number | null;
  gasCostEth: number | null;
}

/**
 * Fetch ETH/USD price from Etherscan's ethprice module.
 * Returns price in USD or null on failure.
 */
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

/**
 * Fetch tx.from, tx.to, and gas data for a batch of transaction hashes.
 * Uses Etherscan eth_getTransactionByHash + eth_getTransactionReceipt (2 calls per tx).
 */
async function fetchTxDetails(
  txHashes: string[],
  etherscanKey: string
): Promise<Map<string, TxDetail>> {
  const details = new Map<string, TxDetail>();
  // concurrency=3 since each hash fires 2 requests internally (6 in-flight max, within Etherscan 5 req/s)
  await batchFetch(txHashes, async (hash) => {
    try {
      // Fetch tx details and receipt in parallel
      const [txResp, receiptResp] = await Promise.all([
        fetch(
          `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionByHash` +
            `&txhash=${hash}&apikey=${etherscanKey}`,
          { signal: AbortSignal.timeout(10_000) }
        ),
        fetch(
          `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionReceipt` +
            `&txhash=${hash}&apikey=${etherscanKey}`,
          { signal: AbortSignal.timeout(10_000) }
        ),
      ]);

      let txFrom = "";
      let txTo = "";
      if (txResp.ok) {
        const txJson = (await txResp.json()) as { result?: { from?: string; to?: string } };
        txFrom = (txJson.result?.from ?? "").toLowerCase();
        txTo = (txJson.result?.to ?? "").toLowerCase();
      }

      let gasUsed: number | null = null;
      let gasPriceGwei: number | null = null;
      let gasCostEth: number | null = null;
      if (receiptResp.ok) {
        const receiptJson = (await receiptResp.json()) as {
          result?: { gasUsed?: string; effectiveGasPrice?: string };
        };
        const r = receiptJson.result;
        if (r?.gasUsed && r?.effectiveGasPrice) {
          gasUsed = parseInt(r.gasUsed, 16);
          const effectiveGasPriceWei = parseInt(r.effectiveGasPrice, 16);
          gasPriceGwei = effectiveGasPriceWei / 1e9;
          gasCostEth = (gasUsed * effectiveGasPriceWei) / 1e18;
        }
      }

      if (txFrom) {
        details.set(hash, { from: txFrom, to: txTo, gasUsed, gasPriceGwei, gasCostEth });
      }
    } catch {
      console.warn(`[rebalance-volume] Failed to fetch tx detail for ${hash}`);
    }
  }, 3);
  return details;
}

export async function syncRebalanceVolume(db: D1Database, etherscanKey: string | null): Promise<void> {
  if (!etherscanKey) {
    console.warn("[rebalance-volume] No ETHERSCAN_API_KEY, skipping");
    return;
  }

  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < VAULT_DEPLOY_BLOCK) lastBlock = VAULT_DEPLOY_BLOCK;

  const fromBlock = lastBlock + 1;
  const toBlock = fromBlock + MAX_BLOCKS_PER_SYNC;
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs` +
    `&address=${CLEAR_VAULT}` +
    `&topic0=${REBALANCE_EVENT_TOPIC}` +
    `&fromBlock=${fromBlock}` +
    `&toBlock=${toBlock}` +
    `&apikey=${etherscanKey}`;

  console.log(`[rebalance-volume] Fetching from Etherscan, fromBlock=${fromBlock}, toBlock=${toBlock}`);

  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) {
    console.warn(`[rebalance-volume] Etherscan returned ${resp.status}`);
    return;
  }

  const json = await resp.json() as {
    status: string;
    message: string;
    result: EtherscanLogEntry[] | string;
  };

  console.log(`[rebalance-volume] Etherscan status=${json.status}, message=${json.message}, resultLength=${Array.isArray(json.result) ? json.result.length : 'N/A'}`);

  if (!Array.isArray(json.result)) {
    const blockUrl = `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${etherscanKey}`;
    const blockResp = await fetch(blockUrl, { signal: AbortSignal.timeout(10_000) });
    if (blockResp.ok) {
      const blockJson = await blockResp.json() as { result: string };
      const latestBlock = parseInt(blockJson.result, 16);
      if (!isNaN(latestBlock) && latestBlock > lastBlock) {
        await setLastBlock(db, SYNC_KEY, latestBlock);
        console.log(`[rebalance-volume] No rebalances found, advanced cursor to ${latestBlock}`);
      }
    }
    return;
  }

  const logs = json.result;
  if (logs.length === 0) return;

  if (logs.length >= 1000) {
    console.warn(`[rebalance-volume] getLogs returned ${logs.length} results — possible silent truncation. Consider reducing MAX_BLOCKS_PER_SYNC.`);
  }

  const uniqueHashes = [...new Set(logs.map((l) => l.transactionHash))];
  const [txDetails, ethPrice] = await Promise.all([
    fetchTxDetails(uniqueHashes, etherscanKey),
    fetchEthPrice(etherscanKey),
  ]);
  console.log(`[rebalance-volume] Fetched tx details for ${txDetails.size}/${uniqueHashes.length} txs, ETH price: $${ethPrice ?? "N/A"}`);

  const dateMap = new Map<string, { volumeUSD: number; rebalanceCount: number }>();
  let maxBlock = lastBlock;
  const txStmts: D1PreparedStatement[] = [];

  for (const log of logs) {
    const blockNum = parseInt(log.blockNumber, 16);
    if (blockNum > maxBlock) maxBlock = blockNum;

    const ts = parseInt(log.timeStamp, 16);
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

    // Per-transaction row (with gas data)
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

    // Daily aggregate
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
