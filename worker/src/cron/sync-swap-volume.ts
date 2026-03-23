import { getLastBlock, setLastBlock } from "../lib/db";

/**
 * Sync Clear Protocol swap volume from on-chain events.
 * Uses Etherscan v2 getLogs API (same as blacklist sync — proven to work from CF Workers).
 * Stores both per-transaction rows (clear_swaps) and daily aggregates (swap_volume).
 */

const CLEAR_VAULT = "0xc4E625Bc9B15F568b2685922fb8e46a7522c4910";
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

interface EtherscanLogEntry {
  blockNumber: string;
  timeStamp: string; // hex timestamp
  transactionHash: string;
  topics: string[];
  data: string;
}

export async function syncSwapVolume(db: D1Database, etherscanKey: string | null): Promise<void> {
  if (!etherscanKey) {
    console.warn("[swap-volume] No ETHERSCAN_API_KEY, skipping");
    return;
  }

  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < VAULT_DEPLOY_BLOCK) lastBlock = VAULT_DEPLOY_BLOCK;

  const url = `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs` +
    `&address=${CLEAR_VAULT}` +
    `&topic0=${SWAP_EVENT_TOPIC}` +
    `&fromBlock=${lastBlock + 1}` +
    `&toBlock=latest` +
    `&apikey=${etherscanKey}`;

  console.log(`[swap-volume] Fetching from Etherscan, fromBlock=${lastBlock + 1}`);

  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) {
    console.warn(`[swap-volume] Etherscan returned ${resp.status}`);
    return;
  }

  const json = await resp.json() as {
    status: string;
    message: string;
    result: EtherscanLogEntry[] | string;
  };

  console.log(`[swap-volume] Etherscan status=${json.status}, message=${json.message}, resultType=${typeof json.result}, resultLength=${Array.isArray(json.result) ? json.result.length : 'N/A'}`);

  // Etherscan returns "No records found" as result string when no logs
  if (!Array.isArray(json.result)) {
    const blockUrl = `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${etherscanKey}`;
    const blockResp = await fetch(blockUrl, { signal: AbortSignal.timeout(10_000) });
    if (blockResp.ok) {
      const blockJson = await blockResp.json() as { result: string };
      const latestBlock = parseInt(blockJson.result, 16);
      if (!isNaN(latestBlock) && latestBlock > lastBlock) {
        await setLastBlock(db, SYNC_KEY, latestBlock);
        console.log(`[swap-volume] No swaps found, advanced cursor to ${latestBlock}`);
      }
    }
    return;
  }

  const logs = json.result;
  if (logs.length === 0) {
    console.log("[swap-volume] Empty result array");
    return;
  }

  // Parse all swap events
  const dateMap = new Map<string, { volumeUSD: number; swapCount: number }>();
  let maxBlock = lastBlock;
  const txStmts: D1PreparedStatement[] = [];

  for (const log of logs) {
    const blockNum = parseInt(log.blockNumber, 16);
    if (blockNum > maxBlock) maxBlock = blockNum;

    const ts = parseInt(log.timeStamp, 16);
    const date = new Date(ts * 1000).toISOString().split("T")[0];
    const txHash = log.transactionHash;

    // Indexed: topic1 = tokenIn, topic2 = tokenOut
    const tokenIn = "0x" + (log.topics[1]?.slice(26) ?? "").toLowerCase();
    const tokenOut = "0x" + (log.topics[2]?.slice(26) ?? "").toLowerCase();

    // Data: receiver (word0), amountIn (word1), tokenAmountOut (word2),
    //       iouAmountOut (word3), iouTreasuryFee (word4), iouLpFee (word5)
    const data = log.data.slice(2); // strip 0x
    const receiver = "0x" + data.slice(24, 64).toLowerCase(); // word0, address padded
    const amountInRaw = BigInt("0x" + data.slice(64, 128));
    const amountOutRaw = BigInt("0x" + data.slice(128, 192));
    const iouAmountOutRaw = BigInt("0x" + data.slice(192, 256));
    const iouTreasuryFeeRaw = BigInt("0x" + data.slice(256, 320));
    const iouLpFeeRaw = BigInt("0x" + data.slice(320, 384));

    const decimalsIn = TOKEN_DECIMALS[tokenIn] ?? 18;
    const decimalsOut = TOKEN_DECIMALS[tokenOut] ?? 18;
    const amountInUsd = Number(amountInRaw) / 10 ** decimalsIn;
    const amountOutUsd = Number(amountOutRaw) / 10 ** decimalsOut;

    // Per-transaction row (INSERT OR IGNORE to handle re-syncs gracefully)
    txStmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO clear_swaps
         (tx_hash, block_number, timestamp, date, token_in, token_out, receiver,
          amount_in_raw, amount_in_usd, amount_out_raw, amount_out_usd,
          iou_amount_out_raw, iou_treasury_fee_raw, iou_lp_fee_raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        txHash, blockNum, ts, date, tokenIn, tokenOut, receiver,
        amountInRaw.toString(), amountInUsd,
        amountOutRaw.toString(), amountOutUsd,
        iouAmountOutRaw.toString(), iouTreasuryFeeRaw.toString(), iouLpFeeRaw.toString()
      )
    );

    // Daily aggregate
    const entry = dateMap.get(date) ?? { volumeUSD: 0, swapCount: 0 };
    entry.volumeUSD += amountInUsd;
    entry.swapCount += 1;
    dateMap.set(date, entry);
  }

  // Batch write: per-transaction rows + daily aggregates + cursor update
  const allStmts: D1PreparedStatement[] = [...txStmts];

  if (dateMap.size > 0) {
    const now = Math.floor(Date.now() / 1000);
    for (const [date, { volumeUSD, swapCount }] of dateMap) {
      allStmts.push(
        db.prepare(
          `INSERT INTO swap_volume (date, volume_usd, swap_count, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET
             volume_usd = excluded.volume_usd,
             swap_count = excluded.swap_count,
             updated_at = excluded.updated_at`
        ).bind(date, volumeUSD, swapCount, now)
      );
    }
  }

  await db.batch(allStmts);
  await setLastBlock(db, SYNC_KEY, maxBlock);
  console.log(`[swap-volume] Synced ${logs.length} swaps across ${dateMap.size} days, up to block ${maxBlock}`);
}
