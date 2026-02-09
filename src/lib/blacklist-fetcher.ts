import type { BlacklistEvent, BlacklistEventType } from "./types";
import { CONTRACT_CONFIGS, ETHERSCAN_V2_BASE, type ContractEventConfig, type ChainConfig } from "./blacklist-contracts";

const MAX_RECURSION_DEPTH = 5;
const ETHERSCAN_MAX_RESULTS = 1000;
const TOKEN_DECIMALS = 6; // Both USDC and USDT use 6 decimals

// --- Rate limiter ---
// Etherscan free tier: 5 req/sec. We use a token-bucket approach
// so parallel fetches share the same limiter.

function createRateLimiter(requestsPerSecond: number) {
  let pending = Promise.resolve();
  const interval = Math.ceil(1000 / requestsPerSecond);

  return function <T>(fn: () => Promise<T>): Promise<T> {
    const execute = pending.then(async () => {
      const result = await fn();
      await new Promise((r) => setTimeout(r, interval));
      return result;
    });
    // Chain the next call after this one's delay
    pending = execute.then(() => {}, () => {});
    return execute;
  };
}

function getEtherscanApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY;
  return key && key.length > 0 ? key : null;
}

function getTrongridApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TRONGRID_API_KEY;
  return key && key.length > 0 ? key : null;
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

// --- EVM fetching via Etherscan v2 API ---

interface EtherscanLogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  transactionHash: string;
  logIndex: string;
}

type RateLimitedFetch = <T>(fn: () => Promise<T>) => Promise<T>;

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
    return res.json();
  });

  if (!json || json.status !== "1" || !Array.isArray(json.result)) {
    if (json?.message === "No records found") return [];
    if (json) console.warn(`[blacklist] Etherscan v2 (chain ${evmChainId}): ${json.message}`);
    return [];
  }

  const logs: EtherscanLogEntry[] = json.result;

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

function parseEvmLogs(
  config: ContractEventConfig,
  eventType: BlacklistEventType,
  hasAmount: boolean,
  logs: EtherscanLogEntry[]
): BlacklistEvent[] {
  return logs.map((log) => {
    const affectedAddress = log.topics.length > 1
      ? decodeAddress(log.topics[1])
      : decodeAddress(log.data.slice(0, 66));

    const amount = hasAmount && log.data.length > 66
      ? decodeUint256("0x" + log.data.slice(66))
      : null;

    return {
      id: `${config.chain.chainId}-${log.transactionHash}-${log.logIndex}`,
      stablecoin: config.stablecoin,
      chainId: config.chain.chainId,
      chainName: config.chain.chainName,
      eventType,
      address: affectedAddress,
      amount,
      txHash: log.transactionHash,
      blockNumber: parseInt(log.blockNumber, 16),
      timestamp: parseInt(log.timeStamp, 16),
      explorerTxUrl: buildExplorerTxUrl(config.chain, log.transactionHash),
      explorerAddressUrl: buildExplorerAddressUrl(config.chain, affectedAddress),
    };
  });
}

async function fetchEvmEvents(
  config: ContractEventConfig,
  apiKey: string | null,
  rateLimit: RateLimitedFetch
): Promise<BlacklistEvent[]> {
  const evmChainId = config.chain.evmChainId;
  if (evmChainId == null) return [];

  // Fetch all event types for this contract in parallel — rate limiter handles sequencing
  const promises = config.events.map(async (eventDef) => {
    const logs = await fetchEvmLogsForTopic(
      evmChainId, config.contractAddress, eventDef.topicHash, apiKey,
      0, 99999999, 0, rateLimit
    );
    return parseEvmLogs(config, eventDef.eventType, eventDef.hasAmount, logs);
  });

  const results = await Promise.all(promises);
  return results.flat();
}

// --- Tron fetching via TronGrid ---

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

async function fetchTronEvents(
  config: ContractEventConfig,
  apiKey: string | null,
  rateLimit: RateLimitedFetch
): Promise<BlacklistEvent[]> {
  const events: BlacklistEvent[] = [];
  const headers: Record<string, string> = {};
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  for (const eventName of TRON_EVENT_NAMES) {
    let url: string | null = `https://api.trongrid.io/v1/contracts/${config.contractAddress}/events?event_name=${eventName}&limit=200&order_by=block_timestamp,desc`;

    while (url) {
      const json: TronEventsResponse | null = await rateLimit(async () => {
        const res = await fetch(url!, { headers });
        if (!res.ok) {
          console.warn(`[blacklist] Tron API error: ${res.status}`);
          return null;
        }
        return res.json();
      });

      if (!json?.success || !Array.isArray(json.data)) break;

      for (const evt of json.data) {
        const eventType = TRON_EVENT_NAME_MAP[evt.event_name];
        if (!eventType) continue;

        const affectedAddress = evt.result._user || evt.result._blackListedUser || evt.result["0"] || "";
        const amount = eventType === "destroy" && (evt.result._balance || evt.result._value || evt.result["1"])
          ? Number(evt.result._balance || evt.result._value || evt.result["1"]) / Math.pow(10, TOKEN_DECIMALS)
          : null;

        events.push({
          id: `${config.chain.chainId}-${evt.transaction_id}-${evt.event_index}`,
          stablecoin: config.stablecoin,
          chainId: config.chain.chainId,
          chainName: config.chain.chainName,
          eventType,
          address: affectedAddress,
          amount,
          txHash: evt.transaction_id,
          blockNumber: evt.block_number,
          timestamp: Math.floor(evt.block_timestamp / 1000),
          explorerTxUrl: buildExplorerTxUrl(config.chain, evt.transaction_id),
          explorerAddressUrl: buildExplorerAddressUrl(config.chain, affectedAddress),
        });
      }

      url = json.meta?.links?.next || null;
    }
  }

  return events;
}

// --- Orchestrator ---

export async function fetchAllBlacklistEvents(): Promise<BlacklistEvent[]> {
  const etherscanKey = getEtherscanApiKey();
  const trongridKey = getTrongridApiKey();

  // Separate rate limiters for each API
  const etherscanLimiter = createRateLimiter(4); // 4/sec to stay safely under 5/sec limit
  const tronLimiter = createRateLimiter(3);

  // Launch all contract fetches in parallel — rate limiters serialize the actual requests
  const promises = CONTRACT_CONFIGS.map(async (config) => {
    try {
      if (config.chain.type === "tron") {
        return await fetchTronEvents(config, trongridKey, tronLimiter);
      } else {
        return await fetchEvmEvents(config, etherscanKey, etherscanLimiter);
      }
    } catch (err) {
      console.warn(`[blacklist] Failed to fetch ${config.stablecoin} on ${config.chain.chainName}:`, err);
      return [];
    }
  });

  const results = await Promise.all(promises);
  const allEvents = results.flat();

  allEvents.sort((a, b) => b.timestamp - a.timestamp);
  return allEvents;
}
