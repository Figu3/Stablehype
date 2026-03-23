import { getLastBlock, setLastBlock } from "../lib/db";
import { fetchWithRetry } from "../lib/fetch-retry";

/**
 * Sync Clear Protocol swap volume from on-chain events.
 * Uses public JSON-RPC eth_getLogs to fetch LiquiditySwapExecuted logs incrementally.
 * Stores daily aggregates in D1 `swap_volume` table.
 */

const CLEAR_VAULT = "0xc4E625Bc9B15F568b2685922fb8e46a7522c4910";
const SWAP_EVENT_TOPIC = "0x532f20306355727dc3dbe3269a79ae1db4dc89b3ede9f89f8225ad4dc03e1be4";

// Token decimals for USD conversion (indexed token = "from" param)
const TOKEN_DECIMALS: Record<string, number> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,  // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 6,  // USDT
  "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f": 18, // GHO
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": 18, // USDe
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f": 18, // USDS
};

const SYNC_KEY = "clear-swap-volume";
const RPC_URLS = [
  "https://eth.drpc.org",
  "https://1rpc.io/eth",
  "https://eth-mainnet.public.blastapi.io",
];
// Clear vault deployed around block 21735000 — never scan before this
const VAULT_DEPLOY_BLOCK = 21735000;

interface RpcLogEntry {
  blockNumber: string;
  topics: string[];
  data: string;
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  for (const rpcUrl of RPC_URLS) {
    const resp = await fetchWithRetry(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!resp) continue;
    const json = await resp.json() as { result?: unknown; error?: { message: string } };
    if (json.error) continue;
    return json.result;
  }
  return null;
}

export async function syncSwapVolume(db: D1Database): Promise<void> {
  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < VAULT_DEPLOY_BLOCK) lastBlock = VAULT_DEPLOY_BLOCK;

  // Get latest block
  const blockHex = await rpcCall("eth_blockNumber", []) as string | null;
  if (!blockHex) return;
  const latestBlock = parseInt(blockHex, 16);
  if (isNaN(latestBlock) || latestBlock <= lastBlock) return;

  // Fetch logs in chunks (public RPCs typically allow 2K-10K block ranges)
  const chunkSize = 2_000;
  const dailyMap = new Map<string, { volumeUSD: number; swapCount: number }>();
  // Track blocks we need timestamps for
  const blockNumbers = new Set<string>();

  for (let from = lastBlock + 1; from <= latestBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, latestBlock);

    const logs = await rpcCall("eth_getLogs", [{
      address: CLEAR_VAULT,
      topics: [SWAP_EVENT_TOPIC],
      fromBlock: "0x" + from.toString(16),
      toBlock: "0x" + to.toString(16),
    }]) as RpcLogEntry[] | null;

    if (!logs || !Array.isArray(logs)) continue;

    for (const log of logs) {
      blockNumbers.add(log.blockNumber);
    }

    for (const log of logs) {
      // topic1 = from (token address, indexed)
      const tokenIn = "0x" + (log.topics[1]?.slice(26) ?? "").toLowerCase();
      const decimals = TOKEN_DECIMALS[tokenIn] ?? 18;

      // data layout: receiver(32) + amountIn(32) + ...
      const data = log.data.slice(2);
      const amountInHex = data.slice(64, 128);
      const amountIn = BigInt("0x" + amountInHex);
      const usdValue = Number(amountIn) / 10 ** decimals;

      // Store with block number, resolve timestamps after
      const key = log.blockNumber; // temporary key, will be replaced with date
      const entry = dailyMap.get(key) ?? { volumeUSD: 0, swapCount: 0 };
      entry.volumeUSD += usdValue;
      entry.swapCount += 1;
      dailyMap.set(key, entry);
    }
  }

  // Resolve block timestamps and re-key by date
  if (dailyMap.size > 0) {
    const blockToDate = new Map<string, string>();
    for (const blockNum of blockNumbers) {
      const block = await rpcCall("eth_getBlockByNumber", [blockNum, false]) as { timestamp: string } | null;
      if (block?.timestamp) {
        const ts = parseInt(block.timestamp, 16);
        blockToDate.set(blockNum, new Date(ts * 1000).toISOString().split("T")[0]);
      }
    }

    // Re-aggregate by date
    const dateMap = new Map<string, { volumeUSD: number; swapCount: number }>();
    for (const [blockNum, vol] of dailyMap) {
      const date = blockToDate.get(blockNum);
      if (!date) continue;
      const entry = dateMap.get(date) ?? { volumeUSD: 0, swapCount: 0 };
      entry.volumeUSD += vol.volumeUSD;
      entry.swapCount += vol.swapCount;
      dateMap.set(date, entry);
    }

    // Upsert daily aggregates
    const now = Math.floor(Date.now() / 1000);
    const stmts = [...dateMap.entries()].map(([date, { volumeUSD, swapCount }]) =>
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
