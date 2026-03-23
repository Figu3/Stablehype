import { getLastBlock, setLastBlock } from "../lib/db";
import { fetchWithRetry } from "../lib/fetch-retry";

/**
 * Sync Clear Protocol swap volume from on-chain events.
 * Uses Etherscan v2 API to fetch LiquiditySwapExecuted logs incrementally.
 * Stores daily aggregates in D1 `swap_volume` table.
 */

const CLEAR_VAULT = "0xc4E625Bc9B15F568b2685922fb8e46a7522c4910";
const SWAP_EVENT_TOPIC = "0x532f20306355727dc3dbe3269a79ae1db4dc89b3ede9f89f8225ad4dc03e1be4"; // LiquiditySwapExecuted(address,address,address,uint256,uint256,uint256,uint256,uint256)

// Token decimals for USD conversion (indexed token = "from" param)
const TOKEN_DECIMALS: Record<string, number> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,  // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 6,  // USDT
  "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f": 18, // GHO
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": 18, // USDe
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f": 18, // USDS
};

const SYNC_KEY = "clear-swap-volume";
const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";
// Clear vault deployed around block 21735000 — never scan before this
const VAULT_DEPLOY_BLOCK = 21735000;

interface EtherscanLogEntry {
  blockNumber: string;
  timeStamp: string;
  topics: string[];
  data: string;
}

export async function syncSwapVolume(db: D1Database, etherscanApiKey: string | null): Promise<void> {
  const apiKeyParam = etherscanApiKey ? `&apikey=${etherscanApiKey}` : "";
  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < VAULT_DEPLOY_BLOCK) lastBlock = VAULT_DEPLOY_BLOCK;

  // Get latest block from Etherscan
  const latestResp = await fetchWithRetry(
    `${ETHERSCAN_BASE}?chainid=1&module=proxy&action=eth_blockNumber${apiKeyParam}`
  );
  if (!latestResp) return;
  const latestJson = await latestResp.json() as { result: string };
  const latestBlock = parseInt(latestJson.result, 16);

  if (latestBlock <= lastBlock) return; // nothing new

  // Fetch logs in chunks (Etherscan allows up to 10K block range for free tier)
  const chunkSize = 10_000;
  const dailyMap = new Map<string, { volumeUSD: number; swapCount: number }>();

  for (let from = lastBlock + 1; from <= latestBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, latestBlock);

    const url = `${ETHERSCAN_BASE}?chainid=1&module=logs&action=getLogs&address=${CLEAR_VAULT}&topic0=${SWAP_EVENT_TOPIC}&fromBlock=${from}&toBlock=${to}${apiKeyParam}`;

    try {
      const resp = await fetchWithRetry(url);
      if (!resp) continue;
      const json = await resp.json() as { status: string; result: EtherscanLogEntry[] | string };

      if (json.status !== "1" || !Array.isArray(json.result)) continue;

      for (const log of json.result) {
        // topic1 = from (token address, indexed), topic2 = to (indexed)
        const tokenIn = "0x" + (log.topics[1]?.slice(26) ?? "").toLowerCase();
        const decimals = TOKEN_DECIMALS[tokenIn] ?? 18;

        // data layout: receiver(32) + amountIn(32) + tokenAmountOut(32) + lpFee(32) + iouAmountOut(32) + iouAmountOut2(32)
        // amountIn starts at byte offset 32 (chars 64-128)
        const data = log.data.slice(2); // remove 0x
        const amountInHex = data.slice(64, 128);
        const amountIn = BigInt("0x" + amountInHex);
        const usdValue = Number(amountIn) / 10 ** decimals;

        // Convert block timestamp to date
        const timestamp = parseInt(log.timeStamp, 16);
        const date = new Date(timestamp * 1000).toISOString().split("T")[0];

        const entry = dailyMap.get(date) ?? { volumeUSD: 0, swapCount: 0 };
        entry.volumeUSD += usdValue;
        entry.swapCount += 1;
        dailyMap.set(date, entry);
      }
    } catch {
      // Skip chunk on error, will catch up next run
      break;
    }
  }

  // Upsert daily aggregates
  if (dailyMap.size > 0) {
    const now = Math.floor(Date.now() / 1000);
    const stmts = [...dailyMap.entries()].map(([date, { volumeUSD, swapCount }]) =>
      db.prepare(
        `INSERT INTO swap_volume (date, volume_usd, swap_count, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           volume_usd = volume_usd + excluded.volume_usd,
           swap_count = swap_count + excluded.swap_count,
           updated_at = excluded.updated_at`
      ).bind(date, volumeUSD, swapCount, now)
    );
    await db.batch(stmts);
  }

  await setLastBlock(db, SYNC_KEY, latestBlock);
}
