// Temporary backfill endpoint — DELETE after use
// Usage: cd worker && npx wrangler dev --remote
//        for i in $(seq 1 200); do echo "batch $i"; curl -s http://localhost:8787/api/_backfill | jq .; sleep 2; done

import {
  CONTRACT_CONFIGS,
  ETHERSCAN_V2_BASE,
  type ContractEventConfig,
} from "../../../src/lib/blacklist-contracts";

const BATCH_SIZE = 25; // Keep well under 50 subrequest limit (each row = 1 fetch)

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

async function fetchEvmTokenBalance(
  evmChainId: number,
  contractAddress: string,
  address: string,
  blockNumber: number,
  apiKey: string | null,
  rateLimit: RateLimitedFetch,
  decimals: number
): Promise<number | null> {
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
      return res.json() as Promise<{ result?: string; error?: unknown }>;
    });

    if (!json?.result || json.error || !json.result.startsWith("0x") || json.result.length < 4) {
      return null;
    }

    const raw = BigInt(json.result);
    return Number(raw) / Math.pow(10, decimals);
  } catch {
    return null;
  }
}

async function fetchTronTokenBalance(
  contractAddress: string,
  address: string,
  apiKey: string | null,
  rateLimit: RateLimitedFetch,
  decimals: number
): Promise<number | null> {
  const headers: Record<string, string> = {};
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

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

    if (!json?.success) return null;
    if (!json.data?.[0]) return 0;
    if (!json.data[0].trc20) return 0;

    for (const tokenEntry of json.data[0].trc20) {
      if (contractAddress in tokenEntry) {
        return Number(BigInt(tokenEntry[contractAddress])) / Math.pow(10, decimals);
      }
    }

    return 0;
  } catch {
    return null;
  }
}

export async function handleBackfill(
  db: D1Database,
  etherscanApiKey: string | null,
  trongridApiKey: string | null
): Promise<Response> {
  const etherscanLimiter = createRateLimiter(4);
  const tronLimiter = createRateLimiter(3);

  const result = await db
    .prepare(
      `SELECT id, chain_id, event_type, address, block_number, stablecoin
       FROM blacklist_events
       WHERE amount IS NULL AND event_type IN ('blacklist', 'unblacklist', 'destroy')
       LIMIT ?`
    )
    .bind(BATCH_SIZE)
    .all<{ id: string; chain_id: string; event_type: string; address: string; block_number: number; stablecoin: string }>();

  if (!result.results?.length) {
    return Response.json({ done: true, remaining: 0 });
  }

  // Count total remaining
  const countResult = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM blacklist_events
       WHERE amount IS NULL AND event_type IN ('blacklist', 'unblacklist', 'destroy')`
    )
    .first<{ cnt: number }>();

  const stmts: D1PreparedStatement[] = [];
  let fetched = 0;
  let resolved = 0;
  let stillNull = 0;

  for (const row of result.results) {
    const config = CONTRACT_CONFIGS.find(
      (c) => c.chain.chainId === row.chain_id && c.stablecoin === row.stablecoin
    );
    if (!config) continue;

    const blockForBalance = row.event_type === "destroy" ? row.block_number - 1 : row.block_number;
    let amount: number | null = null;

    if (config.chain.type === "tron") {
      amount = await fetchTronTokenBalance(
        config.contractAddress, row.address, trongridApiKey, tronLimiter, config.decimals
      );
    } else if (config.chain.evmChainId != null) {
      amount = await fetchEvmTokenBalance(
        config.chain.evmChainId, config.contractAddress,
        row.address, blockForBalance, etherscanApiKey, etherscanLimiter, config.decimals
      );
    }
    fetched++;

    if (amount != null) {
      stmts.push(
        db.prepare("UPDATE blacklist_events SET amount = ? WHERE id = ?").bind(amount, row.id)
      );
      resolved++;
    } else {
      stillNull++;
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return Response.json({
    done: false,
    fetched,
    resolved,
    stillNull,
    remaining: (countResult?.cnt ?? 0) - resolved,
  });
}
