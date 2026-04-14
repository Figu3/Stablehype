import { getLastBlock, setLastBlock } from "../lib/db";
import { CLEAR_TEAM_SAFE, GSM_CONTRACTS } from "../lib/clear-constants";

// Tighter topic1 filter means Etherscan returns a tiny result set even over
// large ranges — safe to scan 100K blocks/cycle here (vs. 5K for the unfiltered
// swap/rebalance syncs). Backfill from vault deploy completes in ~30 cycles
// (~2.5h) instead of 50+ hours.
const BLOCKS_PER_SYNC = 100_000;

/**
 * Sync GSM fees paid by the Clear team Safe directly to Aave GHO GSM contracts.
 *
 * These are BuyAsset / SellAsset events on the two GSM contracts where the Safe
 * is the originator. Fee is denominated in GHO (~$1).
 *
 * Unlike vault rebalances (clear_rebalances), these operations don't emit
 * LiquidityRebalanceExecuted on the ClearVault, so they're invisible to the
 * existing rebalance-volume cron. This cron closes that gap.
 */

// event BuyAsset(address indexed originator, address indexed receiver, uint256 underlyingAmount, uint256 ghoAmount, uint256 fee)
const BUY_ASSET_TOPIC = "0x35b18eb91d0f8ce2968fdf81c1ed9ac429776c7260cdb8bf35c314564e714f66";
// event SellAsset(address indexed originator, address indexed receiver, uint256 underlyingAmount, uint256 ghoAmount, uint256 fee)
const SELL_ASSET_TOPIC = "0xefd9053c6d75eeb7635ae405072e58d5d1588e1ee0db5d212e6afcb529b975e3";

// Earliest block worth scanning (Clear vault deploy — Safe GSM activity cannot predate it)
const SAFE_FIRST_BLOCK = 21735000;

// Pad Safe address to 32-byte topic (lowercase hex, no 0x prefix padding mistake)
const SAFE_TOPIC = "0x" + "0".repeat(24) + CLEAR_TEAM_SAFE.slice(2).toLowerCase();

interface EtherscanLogEntry {
  blockNumber: string;
  timeStamp: string;
  transactionHash: string;
  logIndex: string;
  topics: string[];
  data: string;
}

// UNDERLYING_ASSET for each GSM contract — hard-coded after on-chain verification.
const GSM_UNDERLYING: Record<string, string> = {
  "0x0d8effc11df3f229aa1ea0509bc9dfa632a13578": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0x882285e62656b9623af136ce3078c6bdcc33f5e3": "0x7bc3485026ac48b6cf9baf0a377477fff5703af8", // stataUSDT
};

const SYNC_KEY = "safe-gsm-fees";

async function fetchLogs(
  etherscanKey: string,
  address: string,
  fromBlock: number,
  toBlock: number,
  topic0: string,
  topic1: string
): Promise<EtherscanLogEntry[] | null> {
  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs` +
    `&address=${address}` +
    `&topic0=${topic0}&topic0_1_opr=and&topic1=${topic1}` +
    `&fromBlock=${fromBlock}&toBlock=${toBlock}` +
    `&apikey=${etherscanKey}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) {
      console.warn(`[safe-gsm-fees] Etherscan ${resp.status} for ${address} topic0=${topic0}`);
      return null;
    }
    const json = (await resp.json()) as {
      status: string;
      message: string;
      result: EtherscanLogEntry[] | string;
    };
    if (!Array.isArray(json.result)) return [];
    return json.result;
  } catch (err) {
    console.warn(`[safe-gsm-fees] fetchLogs failed:`, err);
    return null;
  }
}

export async function syncSafeGsmFees(db: D1Database, etherscanKey: string | null): Promise<void> {
  if (!etherscanKey) {
    console.warn("[safe-gsm-fees] No ETHERSCAN_API_KEY, skipping");
    return;
  }

  let lastBlock = await getLastBlock(db, SYNC_KEY);
  if (lastBlock < SAFE_FIRST_BLOCK) lastBlock = SAFE_FIRST_BLOCK;

  // Rewind cursor if it's ahead of chain tip (defensive)
  try {
    const tipResp = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${etherscanKey}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (tipResp.ok) {
      const tipJson = (await tipResp.json()) as { result: string };
      const latestBlock = parseInt(tipJson.result, 16);
      if (!isNaN(latestBlock) && lastBlock > latestBlock) {
        const rewound = Math.max(latestBlock - 128, SAFE_FIRST_BLOCK);
        console.warn(`[safe-gsm-fees] Cursor ${lastBlock} > tip ${latestBlock}, rewinding to ${rewound}`);
        await setLastBlock(db, SYNC_KEY, rewound);
        lastBlock = rewound;
      }
    }
  } catch (err) {
    console.warn(`[safe-gsm-fees] Tip check failed:`, err);
  }

  const fromBlock = lastBlock + 1;
  const toBlock = fromBlock + BLOCKS_PER_SYNC;

  // 2 GSM contracts × 2 events = 4 Etherscan calls per cycle.
  // Each query is tightly filtered by topic0 + topic1=Safe so results stay tiny.
  const allLogs: { log: EtherscanLogEntry; gsm: string; direction: "buy" | "sell" }[] = [];
  let anyFailure = false;

  for (const gsm of GSM_CONTRACTS) {
    for (const [topic0, direction] of [
      [BUY_ASSET_TOPIC, "buy" as const],
      [SELL_ASSET_TOPIC, "sell" as const],
    ] as const) {
      const logs = await fetchLogs(etherscanKey, gsm, fromBlock, toBlock, topic0, SAFE_TOPIC);
      if (logs === null) {
        anyFailure = true;
        continue;
      }
      for (const log of logs) allLogs.push({ log, gsm, direction });
    }
  }

  if (anyFailure) {
    // Don't advance cursor if any query failed — we risk skipping events.
    console.warn(`[safe-gsm-fees] At least one fetch failed; keeping cursor at ${lastBlock}`);
    return;
  }

  let maxBlock = lastBlock;
  const stmts: D1PreparedStatement[] = [];

  for (const { log, gsm, direction } of allLogs) {
    const blockNum = parseInt(log.blockNumber, 16);
    if (blockNum > maxBlock) maxBlock = blockNum;

    const ts = parseInt(log.timeStamp, 16);
    const date = new Date(ts * 1000).toISOString().split("T")[0];
    const logIndex = parseInt(log.logIndex, 16);

    // Indexed topics: originator (topic1), receiver (topic2)
    const originator = "0x" + (log.topics[1]?.slice(26) ?? "").toLowerCase();
    const receiver = "0x" + (log.topics[2]?.slice(26) ?? "").toLowerCase();

    // Defensive guard — Etherscan should have already filtered by topic1, but
    // double-check so a filter bug can't poison the table.
    if (originator !== CLEAR_TEAM_SAFE.toLowerCase()) continue;

    // Data: word0 = underlyingAmount, word1 = ghoAmount, word2 = fee (all uint256, fee in GHO 18d)
    const data = log.data.slice(2);
    const underlyingAmountRaw = BigInt("0x" + data.slice(0, 64));
    const ghoAmountRaw = BigInt("0x" + data.slice(64, 128));
    const feeGhoRaw = BigInt("0x" + data.slice(128, 192));

    // GHO has 18 decimals and pegs to $1 — treat fee_usd = fee_gho
    const feeUsd = Number(feeGhoRaw) / 1e18;

    const underlying = GSM_UNDERLYING[gsm] ?? "";

    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO safe_gsm_fees
             (tx_hash, log_index, block_number, timestamp, date,
              gsm_contract, underlying, direction,
              originator, receiver,
              underlying_amount_raw, gho_amount_raw, fee_gho_raw, fee_usd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          feeUsd
        )
    );
  }

  if (stmts.length > 0) await db.batch(stmts);

  // Advance cursor regardless of whether events were found, but cap at safe tip
  // to avoid skipping un-indexed logs.
  let safeTipBlock: number | null = null;
  try {
    const blockResp = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${etherscanKey}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (blockResp.ok) {
      const blockJson = (await blockResp.json()) as { result: string };
      const latestBlock = parseInt(blockJson.result, 16);
      if (!isNaN(latestBlock)) safeTipBlock = latestBlock - 128;
    }
  } catch {
    // best-effort
  }

  const targetCursor = stmts.length > 0 ? maxBlock : toBlock;
  const newCursor = safeTipBlock !== null ? Math.min(targetCursor, safeTipBlock) : targetCursor;
  if (newCursor > lastBlock) {
    await setLastBlock(db, SYNC_KEY, newCursor);
    console.log(
      `[safe-gsm-fees] Synced ${stmts.length} event(s) in blocks ${fromBlock}–${toBlock}, cursor → ${newCursor}`
    );
  }
}
