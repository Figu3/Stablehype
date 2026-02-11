import {
  CONTRACT_CONFIGS,
  ETHERSCAN_V2_BASE,
  type ContractEventConfig,
  type ChainConfig,
} from "../../../src/lib/blacklist-contracts";
import type { BlacklistEventType } from "../../../src/lib/types";
import { getLastBlock, setLastBlock } from "../lib/db";

const MAX_RECURSION_DEPTH = 5;
const ETHERSCAN_MAX_RESULTS = 1000;
const TOKEN_DECIMALS = 6;
const EVM_SCANNED_TO_LATEST = 99999999;
const BACKFILL_BATCH_SIZE = 20;

type RateLimitedFetch = <T>(fn: () => Promise<T>) => Promise<T>;

function createRateLimiter(requestsPerSecond: number): RateLimitedFetch {
  let pending = Promise.resolve();
  const interval = Math.ceil(1000 / requestsPerSecond);

  return function <T>(fn: () => Promise<T>): Promise<T> {
    const execute = pending.then(async () => {
      const result = await fn();
      await new Promise((r) => setTimeout(r, interval));
      return result;
    });
    pending = execute.then(
      () => {},
      () => {}
    );
    return execute;
  };
}

function decodeAddress(topicOrData: string): string {
  const cleaned = topicOrData.startsWith("0x") ? topicOrData.slice(2) : topicOrData;
  return "0x" + cleaned.slice(24).toLowerCase();
}

function decodeUint256(hexData: string): number {
  const cleaned = hexData.startsWith("0x") ? hexData.slice(2) : hexData;
  const raw = BigInt("0x" + cleaned);
  return Number(raw) / Math.pow(10, TOKEN_DECIMALS);
}

function buildExplorerTxUrl(chain: ChainConfig, txHash: string): string {
  if (chain.type === "tron") {
    return `${chain.explorerUrl}/#/transaction/${txHash}`;
  }
  return `${chain.explorerUrl}/tx/${txHash}`;
}

function buildExplorerAddressUrl(chain: ChainConfig, address: string): string {
  if (chain.type === "tron") {
    return `${chain.explorerUrl}/#/address/${address}`;
  }
  return `${chain.explorerUrl}/address/${address}`;
}

// --- Balance fetching ---

async function fetchEvmTokenBalance(
  evmChainId: number,
  contractAddress: string,
  address: string,
  blockNumber: number,
  apiKey: string | null,
  rateLimit: RateLimitedFetch
): Promise<number | null> {
  // balanceOf(address) selector = 0x70a08231
  const addr = (address.startsWith("0x") ? address.slice(2) : address).toLowerCase();
  const data = "0x70a08231" + addr.padStart(64, "0");
  const blockTag = "0x" + blockNumber.toString(16);

  const params = new URLSearchParams({
    chainid: evmChainId.toString(),
    module: "proxy",
    action: "eth_call",
    to: contractAddress,
    data,
    tag: blockTag,
  });
  if (apiKey) params.set("apikey", apiKey);

  try {
    const json = await rateLimit(async () => {
      const res = await fetch(`${ETHERSCAN_V2_BASE}?${params}`);
      if (!res.ok) return null;
      return res.json() as Promise<{ result: string }>;
    });

    if (!json?.result || json.result === "0x" || json.result === "0x0") return 0;

    const raw = BigInt(json.result);
    return Number(raw) / Math.pow(10, TOKEN_DECIMALS);
  } catch {
    return null;
  }
}

async function fetchTronTokenBalance(
  contractAddress: string,
  address: string,
  apiKey: string | null,
  rateLimit: RateLimitedFetch
): Promise<number | null> {
  const headers: Record<string, string> = {};
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  // Convert 0x-prefixed EVM format to Tron's 41-prefixed hex format
  const tronAddress = address.startsWith("0x") ? "41" + address.slice(2) : address;

  try {
    const json = await rateLimit(async () => {
      const res = await fetch(`https://api.trongrid.io/v1/accounts/${tronAddress}`, { headers });
      if (!res.ok) return null;
      return res.json() as Promise<{
        data: { trc20: Record<string, string>[] }[];
        success: boolean;
      }>;
    });

    if (!json?.success || !json.data?.[0]?.trc20) return null;

    for (const tokenEntry of json.data[0].trc20) {
      if (contractAddress in tokenEntry) {
        return Number(BigInt(tokenEntry[contractAddress])) / Math.pow(10, TOKEN_DECIMALS);
      }
    }

    return 0; // Account exists but has no balance of this token
  } catch {
    return null;
  }
}

// --- EVM fetching ---

interface EtherscanLogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  transactionHash: string;
  logIndex: string;
}

async function fetchEvmLogsForTopic(
  evmChainId: number,
  contractAddress: string,
  topicHash: string,
  apiKey: string | null,
  fromBlock: number,
  toBlock: number,
  depth: number,
  rateLimit: RateLimitedFetch
): Promise<EtherscanLogEntry[]> {
  if (depth > MAX_RECURSION_DEPTH) return [];

  const params = new URLSearchParams({
    chainid: evmChainId.toString(),
    module: "logs",
    action: "getLogs",
    address: contractAddress,
    topic0: topicHash,
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
  });
  if (apiKey) params.set("apikey", apiKey);

  const json = await rateLimit(async () => {
    const res = await fetch(`${ETHERSCAN_V2_BASE}?${params}`);
    if (!res.ok) {
      console.warn(`[blacklist] Etherscan v2 (chain ${evmChainId}) API error: ${res.status}`);
      return null;
    }
    return res.json() as Promise<{ status: string; message: string; result: EtherscanLogEntry[] }>;
  });

  if (!json || json.status !== "1" || !Array.isArray(json.result)) {
    if (json?.message === "No records found") return [];
    if (json) console.warn(`[blacklist] Etherscan v2 (chain ${evmChainId}): ${json.message}`);
    return [];
  }

  const logs = json.result;

  if (logs.length >= ETHERSCAN_MAX_RESULTS) {
    const mid = Math.floor((fromBlock + toBlock) / 2);
    if (mid === fromBlock) return logs;

    const [first, second] = await Promise.all([
      fetchEvmLogsForTopic(evmChainId, contractAddress, topicHash, apiKey, fromBlock, mid, depth + 1, rateLimit),
      fetchEvmLogsForTopic(evmChainId, contractAddress, topicHash, apiKey, mid + 1, toBlock, depth + 1, rateLimit),
    ]);
    return [...first, ...second];
  }

  return logs;
}

interface BlacklistRow {
  id: string;
  stablecoin: string;
  chain_id: string;
  chain_name: string;
  event_type: string;
  address: string;
  amount: number | null;
  tx_hash: string;
  block_number: number;
  timestamp: number;
  explorer_tx_url: string;
  explorer_address_url: string;
}

function parseEvmLogs(
  config: ContractEventConfig,
  eventType: BlacklistEventType,
  hasAmount: boolean,
  logs: EtherscanLogEntry[]
): BlacklistRow[] {
  return logs.map((log) => {
    const addressIndexed = log.topics.length > 1;
    const affectedAddress = addressIndexed
      ? decodeAddress(log.topics[1])
      : decodeAddress(log.data.slice(0, 66));

    // When address is indexed (in topics), amount is the first data field.
    // When address is non-indexed (in data), amount is the second data field.
    const amount = hasAmount
      ? addressIndexed
        ? log.data.length >= 66 ? decodeUint256(log.data) : null
        : log.data.length > 66 ? decodeUint256("0x" + log.data.slice(66)) : null
      : null;

    return {
      id: `${config.chain.chainId}-${log.transactionHash}-${log.logIndex}`,
      stablecoin: config.stablecoin,
      chain_id: config.chain.chainId,
      chain_name: config.chain.chainName,
      event_type: eventType,
      address: affectedAddress,
      amount,
      tx_hash: log.transactionHash,
      block_number: parseInt(log.blockNumber, 16),
      timestamp: parseInt(log.timeStamp, 16),
      explorer_tx_url: buildExplorerTxUrl(config.chain, log.transactionHash),
      explorer_address_url: buildExplorerAddressUrl(config.chain, affectedAddress),
    };
  });
}

async function fetchEvmEventsIncremental(
  config: ContractEventConfig,
  apiKey: string | null,
  fromBlock: number,
  rateLimit: RateLimitedFetch
): Promise<{ rows: BlacklistRow[]; maxBlock: number }> {
  const evmChainId = config.chain.evmChainId;
  if (evmChainId == null) return { rows: [], maxBlock: fromBlock };

  const allRows: BlacklistRow[] = [];
  let maxBlock = fromBlock;

  for (const eventDef of config.events) {
    const logs = await fetchEvmLogsForTopic(
      evmChainId,
      config.contractAddress,
      eventDef.topicHash,
      apiKey,
      fromBlock,
      99999999,
      0,
      rateLimit
    );
    const rows = parseEvmLogs(config, eventDef.eventType, eventDef.hasAmount, logs);
    allRows.push(...rows);

    for (const row of rows) {
      if (row.block_number > maxBlock) maxBlock = row.block_number;
    }
  }

  return { rows: allRows, maxBlock };
}

// --- Tron fetching ---

interface TronEventResult {
  block_number: number;
  block_timestamp: number;
  transaction_id: string;
  event_index: number;
  event_name: string;
  result: Record<string, string>;
}

interface TronEventsResponse {
  data: TronEventResult[];
  meta?: { links?: { next?: string } };
  success: boolean;
}

const TRON_EVENT_NAME_MAP: Record<string, BlacklistEventType> = {
  AddedBlackList: "blacklist",
  RemovedBlackList: "unblacklist",
  DestroyedBlackFunds: "destroy",
};

const TRON_EVENT_NAMES = Object.keys(TRON_EVENT_NAME_MAP);

async function fetchTronEventsIncremental(
  config: ContractEventConfig,
  apiKey: string | null,
  lastTimestampMs: number,
  rateLimit: RateLimitedFetch
): Promise<{ rows: BlacklistRow[]; maxBlock: number }> {
  const rows: BlacklistRow[] = [];
  let maxBlock = 0;
  const headers: Record<string, string> = {};
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  for (const eventName of TRON_EVENT_NAMES) {
    const tsFilter = lastTimestampMs > 0 ? `&min_block_timestamp=${lastTimestampMs}` : "";
    let url: string | null = `https://api.trongrid.io/v1/contracts/${config.contractAddress}/events?event_name=${eventName}&limit=200&order_by=block_timestamp,desc${tsFilter}`;

    while (url) {
      const json: TronEventsResponse | null = await rateLimit(async () => {
        const res = await fetch(url!, { headers });
        if (!res.ok) {
          console.warn(`[blacklist] Tron API error: ${res.status}`);
          return null;
        }
        return res.json() as Promise<TronEventsResponse>;
      });

      if (!json?.success || !Array.isArray(json.data)) break;

      for (const evt of json.data) {
        const eventType = TRON_EVENT_NAME_MAP[evt.event_name];
        if (!eventType) continue;

        const affectedAddress = evt.result._user || evt.result._blackListedUser || evt.result["0"] || "";
        const amount =
          eventType === "destroy" && (evt.result._balance || evt.result._value || evt.result["1"])
            ? Number(evt.result._balance || evt.result._value || evt.result["1"]) / Math.pow(10, TOKEN_DECIMALS)
            : null;

        if (evt.block_timestamp > maxBlock) maxBlock = evt.block_timestamp;

        rows.push({
          id: `${config.chain.chainId}-${evt.transaction_id}-${evt.event_index}`,
          stablecoin: config.stablecoin,
          chain_id: config.chain.chainId,
          chain_name: config.chain.chainName,
          event_type: eventType,
          address: affectedAddress,
          amount,
          tx_hash: evt.transaction_id,
          block_number: evt.block_number,
          timestamp: Math.floor(evt.block_timestamp / 1000),
          explorer_tx_url: buildExplorerTxUrl(config.chain, evt.transaction_id),
          explorer_address_url: buildExplorerAddressUrl(config.chain, affectedAddress),
        });
      }

      url = json.meta?.links?.next || null;
    }
  }

  return { rows, maxBlock };
}

// --- Enrichment: fetch balances for blacklist/unblacklist events ---

async function enrichRowBalances(
  rows: BlacklistRow[],
  config: ContractEventConfig,
  etherscanApiKey: string | null,
  trongridApiKey: string | null,
  etherscanLimiter: RateLimitedFetch,
  tronLimiter: RateLimitedFetch
): Promise<void> {
  for (const row of rows) {
    if (row.amount != null) continue;
    if (row.event_type !== "blacklist" && row.event_type !== "unblacklist") continue;

    if (config.chain.type === "tron") {
      row.amount = await fetchTronTokenBalance(
        config.contractAddress, row.address, trongridApiKey, tronLimiter
      );
    } else if (config.chain.evmChainId != null) {
      row.amount = await fetchEvmTokenBalance(
        config.chain.evmChainId, config.contractAddress,
        row.address, row.block_number, etherscanApiKey, etherscanLimiter
      );
    }
  }
}

// --- Backfill: update existing events that have null amounts ---

async function backfillAmounts(
  db: D1Database,
  etherscanApiKey: string | null,
  trongridApiKey: string | null,
  etherscanLimiter: RateLimitedFetch,
  tronLimiter: RateLimitedFetch
): Promise<void> {
  const result = await db
    .prepare(
      `SELECT id, chain_id, address, block_number
       FROM blacklist_events
       WHERE amount IS NULL AND event_type IN ('blacklist', 'unblacklist')
       LIMIT ?`
    )
    .bind(BACKFILL_BATCH_SIZE)
    .all<{ id: string; chain_id: string; address: string; block_number: number }>();

  if (!result.results?.length) return;

  const stmts: D1PreparedStatement[] = [];

  for (const row of result.results) {
    const config = CONTRACT_CONFIGS.find((c) => c.chain.chainId === row.chain_id);
    if (!config) continue;

    let amount: number | null = null;

    if (config.chain.type === "tron") {
      amount = await fetchTronTokenBalance(
        config.contractAddress, row.address, trongridApiKey, tronLimiter
      );
    } else if (config.chain.evmChainId != null) {
      amount = await fetchEvmTokenBalance(
        config.chain.evmChainId, config.contractAddress,
        row.address, row.block_number, etherscanApiKey, etherscanLimiter
      );
    }

    if (amount != null) {
      stmts.push(
        db.prepare("UPDATE blacklist_events SET amount = ? WHERE id = ?").bind(amount, row.id)
      );
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
    console.log(`[sync-blacklist] Backfilled amounts for ${stmts.length} events`);
  }
}

// --- Orchestrator ---

async function insertRows(db: D1Database, rows: BlacklistRow[]): Promise<void> {
  if (rows.length === 0) return;

  // D1 batch limit: use batches of 50 for safety
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const stmts = batch.map((row) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO blacklist_events
           (id, stablecoin, chain_id, chain_name, event_type, address, amount, tx_hash, block_number, timestamp, explorer_tx_url, explorer_address_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          row.stablecoin,
          row.chain_id,
          row.chain_name,
          row.event_type,
          row.address,
          row.amount,
          row.tx_hash,
          row.block_number,
          row.timestamp,
          row.explorer_tx_url,
          row.explorer_address_url
        )
    );
    await db.batch(stmts);
  }
}

export async function syncBlacklist(
  db: D1Database,
  etherscanApiKey: string | null,
  trongridApiKey: string | null
): Promise<void> {
  const etherscanLimiter = createRateLimiter(4);
  const tronLimiter = createRateLimiter(3);

  const configStates = await Promise.all(
    CONTRACT_CONFIGS.map(async (config) => {
      const configKey = `${config.chain.chainId}-${config.contractAddress}`;
      const lastBlock = await getLastBlock(db, configKey);
      return { config, configKey, lastBlock };
    })
  );

  // Sort by lastBlock ascending so least-synced configs go first
  configStates.sort((a, b) => a.lastBlock - b.lastBlock);

  for (const { config, configKey, lastBlock } of configStates) {
    try {
      let result: { rows: BlacklistRow[]; maxBlock: number };

      if (config.chain.type === "tron") {
        result = await fetchTronEventsIncremental(config, trongridApiKey, lastBlock, tronLimiter);
      } else {
        const fromBlock = lastBlock > 0 ? lastBlock + 1 : 0;
        result = await fetchEvmEventsIncremental(config, etherscanApiKey, fromBlock, etherscanLimiter);
      }

      // Fetch balances for new blacklist/unblacklist events before inserting
      await enrichRowBalances(
        result.rows, config, etherscanApiKey, trongridApiKey, etherscanLimiter, tronLimiter
      );

      await insertRows(db, result.rows);

      // Always advance sync state: use result.maxBlock if events found,
      // otherwise mark as scanned up to latest (EVM) or current time (Tron)
      const newBlock = result.rows.length > 0
        ? result.maxBlock
        : config.chain.type === "tron"
          ? Date.now()
          : EVM_SCANNED_TO_LATEST;

      if (newBlock > lastBlock) {
        await setLastBlock(db, configKey, newBlock);
      }

      console.log(
        `[sync-blacklist] ${config.stablecoin} on ${config.chain.chainName}: ${result.rows.length} new events, block ${result.maxBlock}`
      );
    } catch (err) {
      console.warn(`[sync-blacklist] Failed ${config.stablecoin} on ${config.chain.chainName}:`, err);
    }
  }

  // Backfill amounts for existing events that were stored without balances
  try {
    await backfillAmounts(db, etherscanApiKey, trongridApiKey, etherscanLimiter, tronLimiter);
  } catch (err) {
    console.warn("[sync-blacklist] Backfill failed:", err);
  }
}
