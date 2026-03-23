import { getLastBlock, setLastBlock } from "../lib/db";

/**
 * Sync Clear Protocol rebalance volume from on-chain events.
 * Uses Etherscan v2 getLogs API (same pattern as swap volume sync).
 * Stores daily aggregates in D1 `rebalance_volume` table.
 */

const CLEAR_VAULT = "0xc4E625Bc9B15F568b2685922fb8e46a7522c4910";
const REBALANCE_EVENT_TOPIC = "0x3709543b275c855b8c7e1ef76d05540d1b71197781be66cc691d228217acd7c8";

// Token decimals for USD conversion
// Event data: from (address), to (address), amountIn (uint256), amountOut (uint256)
// amountIn is denominated in the "from" token
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
  topics: string[];
  data: string;
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
    // No logs — advance cursor
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

  // Aggregate by date
  const dateMap = new Map<string, { volumeUSD: number; rebalanceCount: number }>();
  let maxBlock = lastBlock;

  for (const log of logs) {
    const blockNum = parseInt(log.blockNumber, 16);
    if (blockNum > maxBlock) maxBlock = blockNum;

    const ts = parseInt(log.timeStamp, 16);
    const date = new Date(ts * 1000).toISOString().split("T")[0];

    // Data layout: from (address, 32 bytes), to (address, 32 bytes), amountIn (uint256), amountOut (uint256)
    const data = log.data.slice(2);
    const fromToken = "0x" + data.slice(24, 64).toLowerCase();
    const decimals = TOKEN_DECIMALS[fromToken] ?? 18;
    const amountInHex = data.slice(128, 192);
    const amountIn = BigInt("0x" + amountInHex);
    const usdValue = Number(amountIn) / 10 ** decimals;

    const entry = dateMap.get(date) ?? { volumeUSD: 0, rebalanceCount: 0 };
    entry.volumeUSD += usdValue;
    entry.rebalanceCount += 1;
    dateMap.set(date, entry);
  }

  if (dateMap.size > 0) {
    const now = Math.floor(Date.now() / 1000);
    const stmts = [...dateMap.entries()].map(([date, { volumeUSD, rebalanceCount }]) =>
      db.prepare(
        `INSERT INTO rebalance_volume (date, volume_usd, rebalance_count, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           volume_usd = excluded.volume_usd,
           rebalance_count = excluded.rebalance_count,
           updated_at = excluded.updated_at`
      ).bind(date, volumeUSD, rebalanceCount, now)
    );
    await db.batch(stmts);
  }

  await setLastBlock(db, SYNC_KEY, maxBlock);
  console.log(`[rebalance-volume] Synced ${logs.length} rebalances across ${dateMap.size} days, up to block ${maxBlock}`);
}
