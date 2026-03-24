import { getLastBlock, setLastBlock } from "../lib/db";

/**
 * Sync Clear Protocol rebalance volume from on-chain events.
 * Uses Etherscan v2 getLogs API (same pattern as swap volume sync).
 * Stores both per-transaction rows (clear_rebalances) and daily aggregates (rebalance_volume).
 */

const CLEAR_VAULT = "0xc4E625Bc9B15F568b2685922fb8e46a7522c4910";
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
}

/**
 * Fetch tx.from and tx.to for a batch of transaction hashes.
 * Uses Etherscan eth_getTransactionByHash proxy (1 call per tx).
 */
async function fetchTxDetails(
  txHashes: string[],
  etherscanKey: string
): Promise<Map<string, TxDetail>> {
  const details = new Map<string, TxDetail>();
  for (const hash of txHashes) {
    try {
      const url =
        `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionByHash` +
        `&txhash=${hash}&apikey=${etherscanKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) continue;
      const json = (await resp.json()) as { result?: { from?: string; to?: string } };
      if (json.result?.from) {
        details.set(hash, {
          from: (json.result.from ?? "").toLowerCase(),
          to: (json.result.to ?? "").toLowerCase(),
        });
      }
    } catch {
      console.warn(`[rebalance-volume] Failed to fetch tx detail for ${hash}`);
    }
  }
  return details;
}

export async function syncRebalanceVolume(db: D1Database, etherscanKey: string | null): Promise<void> {
  if (!etherscanKey) {
    console.warn("[rebalance-volume] No ETHERSCAN_API_KEY, skipping");
    return;
  }

  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < VAULT_DEPLOY_BLOCK) lastBlock = VAULT_DEPLOY_BLOCK;

  const url = `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs` +
    `&address=${CLEAR_VAULT}` +
    `&topic0=${REBALANCE_EVENT_TOPIC}` +
    `&fromBlock=${lastBlock + 1}` +
    `&toBlock=latest` +
    `&apikey=${etherscanKey}`;

  console.log(`[rebalance-volume] Fetching from Etherscan, fromBlock=${lastBlock + 1}`);

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

  const uniqueHashes = [...new Set(logs.map((l) => l.transactionHash))];
  const txDetails = await fetchTxDetails(uniqueHashes, etherscanKey);
  console.log(`[rebalance-volume] Fetched tx details for ${txDetails.size}/${uniqueHashes.length} txs`);

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

    // Per-transaction row
    const detail = txDetails.get(txHash);
    const txFrom = detail?.from ?? null;
    const txTo = detail?.to ?? null;
    txStmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO clear_rebalances
         (tx_hash, block_number, timestamp, date, token_in, token_out,
          amount_in_raw, amount_in_usd, amount_out_raw, amount_out_usd,
          tx_from, tx_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        txHash, blockNum, ts, date, tokenIn, tokenOut,
        amountInRaw.toString(), amountInUsd,
        amountOutRaw.toString(), amountOutUsd,
        txFrom, txTo
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
             volume_usd = excluded.volume_usd,
             rebalance_count = excluded.rebalance_count,
             updated_at = excluded.updated_at`
        ).bind(date, volumeUSD, rebalanceCount, now)
      );
    }
  }

  await db.batch(allStmts);
  await setLastBlock(db, SYNC_KEY, maxBlock);
  console.log(`[rebalance-volume] Synced ${logs.length} rebalances across ${dateMap.size} days, up to block ${maxBlock}`);
}
