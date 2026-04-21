import { getLastBlock, setLastBlock } from "../lib/db";
import {
  CLEAR_TEAM_SAFE,
  GSM_CONTRACTS_PLASMA,
  GSM_UNDERLYING_PLASMA,
  PLASMA_CHAIN_ID,
  PLASMA_RPC_URL,
  PLASMA_SAFE_FIRST_BLOCK,
} from "../lib/clear-constants";

/**
 * Plasma-side counterpart of sync-safe-gsm-fees.
 *
 * The Clear team Safe also calls `buyAsset` / `sellAsset` on the Aave GHO USDT
 * GSM deployed on Plasma (chainId 9745) as part of cross-chain rebalancing
 * (bridging GHO to Plasma when Ethereum's Aave USDT pool is illiquid, then
 * converting to stataUSDT via the Plasma GSM). Fees from those events must
 * feed the same gsm-fees counter as Ethereum so the total "owed" figure
 * is chain-agnostic.
 *
 * Plasma has no Etherscan v2 coverage yet, so we query logs directly via
 * public RPC with tight topic filters. The RPC caps getLogs at 10K blocks
 * per call, so we cap the per-cycle window accordingly.
 */

const BUY_ASSET_TOPIC = "0x35b18eb91d0f8ce2968fdf81c1ed9ac429776c7260cdb8bf35c314564e714f66";
const SELL_ASSET_TOPIC = "0xefd9053c6d75eeb7635ae405072e58d5d1588e1ee0db5d212e6afcb529b975e3";

// Plasma's public RPC rejects getLogs ranges > 10K blocks.
const BLOCKS_PER_SYNC = 10_000;

const SAFE_TOPIC = "0x" + "0".repeat(24) + CLEAR_TEAM_SAFE.slice(2).toLowerCase();

const SYNC_KEY = "safe-gsm-fees-plasma";

interface RpcLog {
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  topics: string[];
  data: string;
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const resp = await fetch(PLASMA_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      console.warn(`[safe-gsm-fees-plasma] RPC ${method} returned ${resp.status}`);
      return null;
    }
    const json = (await resp.json()) as { result?: T; error?: { message: string } };
    if (json.error) {
      console.warn(`[safe-gsm-fees-plasma] RPC ${method} error: ${json.error.message}`);
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    console.warn(`[safe-gsm-fees-plasma] RPC ${method} failed:`, err);
    return null;
  }
}

async function fetchLogs(
  address: string,
  fromBlock: number,
  toBlock: number,
  topic0: string
): Promise<RpcLog[] | null> {
  return rpcCall<RpcLog[]>("eth_getLogs", [
    {
      address,
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock: "0x" + toBlock.toString(16),
      // Indexed topics on BuyAsset/SellAsset: topic1=originator, topic2=receiver.
      // Filter by originator=Safe so the RPC returns only our events.
      topics: [topic0, SAFE_TOPIC],
    },
  ]);
}

async function fetchBlockTimestamp(blockNumber: number): Promise<number | null> {
  const block = await rpcCall<{ timestamp: string } | null>("eth_getBlockByNumber", [
    "0x" + blockNumber.toString(16),
    false,
  ]);
  if (!block) return null;
  return parseInt(block.timestamp, 16);
}

export async function syncSafeGsmFeesPlasma(db: D1Database): Promise<void> {
  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < PLASMA_SAFE_FIRST_BLOCK) lastBlock = PLASMA_SAFE_FIRST_BLOCK;

  const tipHex = await rpcCall<string>("eth_blockNumber", []);
  if (!tipHex) {
    console.warn(`[safe-gsm-fees-plasma] Tip query failed, skipping cycle`);
    return;
  }
  const latestBlock = parseInt(tipHex, 16);
  if (lastBlock > latestBlock) {
    const rewound = Math.max(latestBlock - 128, PLASMA_SAFE_FIRST_BLOCK);
    console.warn(
      `[safe-gsm-fees-plasma] Cursor ${lastBlock} > tip ${latestBlock}, rewinding to ${rewound}`
    );
    await setLastBlock(db, SYNC_KEY, rewound);
    lastBlock = rewound;
  }

  const fromBlock = lastBlock + 1;
  const toBlock = Math.min(fromBlock + BLOCKS_PER_SYNC, latestBlock);
  if (toBlock < fromBlock) {
    // Caught up — nothing to do this cycle.
    return;
  }

  const allLogs: { log: RpcLog; gsm: string; direction: "buy" | "sell" }[] = [];
  let anyFailure = false;

  for (const gsm of GSM_CONTRACTS_PLASMA) {
    for (const [topic0, direction] of [
      [BUY_ASSET_TOPIC, "buy" as const],
      [SELL_ASSET_TOPIC, "sell" as const],
    ] as const) {
      const logs = await fetchLogs(gsm, fromBlock, toBlock, topic0);
      if (logs === null) {
        anyFailure = true;
        continue;
      }
      for (const log of logs) allLogs.push({ log, gsm, direction });
    }
  }

  if (anyFailure) {
    console.warn(`[safe-gsm-fees-plasma] At least one fetch failed; keeping cursor at ${lastBlock}`);
    return;
  }

  // RPC logs don't include block timestamps — fetch them per unique block.
  const uniqueBlocks = new Set<number>();
  for (const { log } of allLogs) uniqueBlocks.add(parseInt(log.blockNumber, 16));
  const blockTs = new Map<number, number>();
  for (const block of uniqueBlocks) {
    const ts = await fetchBlockTimestamp(block);
    if (ts === null) {
      console.warn(`[safe-gsm-fees-plasma] Failed to fetch ts for block ${block}, skipping cycle`);
      return;
    }
    blockTs.set(block, ts);
  }

  let maxBlock = lastBlock;
  const stmts: D1PreparedStatement[] = [];

  for (const { log, gsm, direction } of allLogs) {
    const blockNum = parseInt(log.blockNumber, 16);
    if (blockNum > maxBlock) maxBlock = blockNum;

    const ts = blockTs.get(blockNum)!;
    const date = new Date(ts * 1000).toISOString().split("T")[0];
    const logIndex = parseInt(log.logIndex, 16);

    const originator = "0x" + (log.topics[1]?.slice(26) ?? "").toLowerCase();
    const receiver = "0x" + (log.topics[2]?.slice(26) ?? "").toLowerCase();

    if (originator !== CLEAR_TEAM_SAFE.toLowerCase()) continue;

    const data = log.data.slice(2);
    const underlyingAmountRaw = BigInt("0x" + data.slice(0, 64));
    const ghoAmountRaw = BigInt("0x" + data.slice(64, 128));
    const feeGhoRaw = BigInt("0x" + data.slice(128, 192));

    const feeUsd = Number(feeGhoRaw) / 1e18;
    const underlying = GSM_UNDERLYING_PLASMA[gsm] ?? "";

    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO safe_gsm_fees
             (tx_hash, log_index, block_number, timestamp, date,
              gsm_contract, underlying, direction,
              originator, receiver,
              underlying_amount_raw, gho_amount_raw, fee_gho_raw, fee_usd, chain_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          log.transactionHash,
          logIndex,
          blockNum,
          ts,
          date,
          gsm,
          underlying,
          direction,
          originator,
          receiver,
          underlyingAmountRaw.toString(),
          ghoAmountRaw.toString(),
          feeGhoRaw.toString(),
          feeUsd,
          PLASMA_CHAIN_ID
        )
    );
  }

  if (stmts.length > 0) await db.batch(stmts);

  // Cursor advance: use maxBlock if we saw events, otherwise toBlock.
  // Both are ≤ latestBlock so we can't overshoot the chain tip.
  const newCursor = stmts.length > 0 ? maxBlock : toBlock;
  if (newCursor > lastBlock) {
    await setLastBlock(db, SYNC_KEY, newCursor);
    console.log(
      `[safe-gsm-fees-plasma] Synced ${stmts.length} event(s) in blocks ${fromBlock}–${toBlock}, cursor → ${newCursor}`
    );
  }
}
