/**
 * TEMPORARY one-off backfill endpoint.
 * Fetches balances for blacklist/unblacklist events that have null amounts.
 * Delete this file after backfill is complete.
 */
import {
  CONTRACT_CONFIGS,
  ETHERSCAN_V2_BASE,
} from "../../../src/lib/blacklist-contracts";

const BATCH_SIZE = 50;
const TOKEN_DECIMALS = 6;

function createRateLimiter(requestsPerSecond: number) {
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

interface DiagResult {
  id: string;
  chain: string;
  address: string;
  blockNumber: number;
  result: "ok" | "null" | "error";
  amount: number | null;
  detail?: string;
}

async function fetchEvmBalanceDiag(
  evmChainId: number,
  contractAddress: string,
  address: string,
  blockNumber: number,
  apiKey: string | null,
  rateLimit: ReturnType<typeof createRateLimiter>
): Promise<{ amount: number | null; detail: string }> {
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
    const rawRes = await rateLimit(async () => {
      return fetch(`${ETHERSCAN_V2_BASE}?${params}`);
    });

    if (!rawRes.ok) {
      return { amount: null, detail: `HTTP ${rawRes.status}` };
    }

    const json = await rawRes.json() as { result?: string; error?: { message?: string }; message?: string };

    if (json.error) {
      return { amount: null, detail: `API error: ${json.error.message || JSON.stringify(json.error)}` };
    }

    if (json.message && json.message !== "OK" && !json.result) {
      return { amount: null, detail: `API message: ${json.message}` };
    }

    if (!json.result || json.result === "0x" || json.result === "0x0") {
      return { amount: 0, detail: "zero balance" };
    }

    // Check for error-like result strings (e.g. "execution reverted")
    if (typeof json.result === "string" && !json.result.startsWith("0x")) {
      return { amount: null, detail: `Non-hex result: ${json.result.slice(0, 100)}` };
    }

    const amount = Number(BigInt(json.result)) / Math.pow(10, TOKEN_DECIMALS);
    return { amount, detail: `balance=${amount}` };
  } catch (err) {
    return { amount: null, detail: `Exception: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function fetchTronBalanceDiag(
  contractAddress: string,
  address: string,
  apiKey: string | null,
  rateLimit: ReturnType<typeof createRateLimiter>
): Promise<{ amount: number | null; detail: string }> {
  const headers: Record<string, string> = {};
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  // Convert 0x-prefixed EVM format to Tron's 41-prefixed hex format
  const tronAddress = address.startsWith("0x") ? "41" + address.slice(2) : address;

  try {
    const rawRes = await rateLimit(async () => {
      return fetch(`https://api.trongrid.io/v1/accounts/${tronAddress}`, { headers });
    });

    if (!rawRes.ok) {
      const body = await rawRes.text().catch(() => "");
      return { amount: null, detail: `HTTP ${rawRes.status}: ${body.slice(0, 200)}` };
    }

    const json = await rawRes.json() as {
      data: { trc20: Record<string, string>[] }[];
      success: boolean;
    };

    if (!json?.success) {
      return { amount: null, detail: `success=false: ${JSON.stringify(json).slice(0, 200)}` };
    }

    if (!json.data?.[0]) {
      return { amount: 0, detail: "no account data — 0 balance" };
    }

    if (!json.data[0].trc20) {
      return { amount: 0, detail: "account exists but no trc20 array" };
    }

    for (const tokenEntry of json.data[0].trc20) {
      if (contractAddress in tokenEntry) {
        const amount = Number(BigInt(tokenEntry[contractAddress])) / Math.pow(10, TOKEN_DECIMALS);
        return { amount, detail: `balance=${amount}` };
      }
    }
    return { amount: 0, detail: "account exists, has trc20 tokens, but not this contract" };
  } catch (err) {
    return { amount: null, detail: `Exception: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function handleBackfill(
  db: D1Database,
  etherscanApiKey: string | null,
  trongridApiKey: string | null
): Promise<Response> {
  const ethLimiter = createRateLimiter(4);
  const tronLimiter = createRateLimiter(3);

  console.log(`[backfill] API keys: etherscan=${etherscanApiKey ? "yes" : "NO"}, trongrid=${trongridApiKey ? "yes" : "NO"}`);

  // Count remaining
  const countRow = await db
    .prepare(
      "SELECT COUNT(*) as cnt FROM blacklist_events WHERE amount IS NULL AND event_type IN ('blacklist', 'unblacklist')"
    )
    .first<{ cnt: number }>();
  const remaining = countRow?.cnt ?? 0;

  if (remaining === 0) {
    return new Response(JSON.stringify({ done: true, remaining: 0, updated: 0, diagnostics: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await db
    .prepare(
      `SELECT id, chain_id, address, block_number
       FROM blacklist_events
       WHERE amount IS NULL AND event_type IN ('blacklist', 'unblacklist')
       LIMIT ?`
    )
    .bind(BATCH_SIZE)
    .all<{ id: string; chain_id: string; address: string; block_number: number }>();

  if (!result.results?.length) {
    return new Response(JSON.stringify({ done: true, remaining: 0, updated: 0, diagnostics: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const stmts: D1PreparedStatement[] = [];
  const diagnostics: DiagResult[] = [];

  for (const row of result.results) {
    const config = CONTRACT_CONFIGS.find((c) => c.chain.chainId === row.chain_id);
    if (!config) {
      diagnostics.push({
        id: row.id, chain: row.chain_id, address: row.address,
        blockNumber: row.block_number, result: "error", amount: null,
        detail: "no matching CONTRACT_CONFIG",
      });
      continue;
    }

    let diag: { amount: number | null; detail: string };

    if (config.chain.type === "tron") {
      diag = await fetchTronBalanceDiag(
        config.contractAddress, row.address, trongridApiKey, tronLimiter
      );
    } else if (config.chain.evmChainId != null) {
      diag = await fetchEvmBalanceDiag(
        config.chain.evmChainId, config.contractAddress,
        row.address, row.block_number, etherscanApiKey, ethLimiter
      );
    } else {
      diag = { amount: null, detail: "unsupported chain type" };
    }

    diagnostics.push({
      id: row.id,
      chain: row.chain_id,
      address: row.address,
      blockNumber: row.block_number,
      result: diag.amount != null ? "ok" : "null",
      amount: diag.amount,
      detail: diag.detail,
    });

    if (diag.amount != null) {
      stmts.push(
        db.prepare("UPDATE blacklist_events SET amount = ? WHERE id = ?").bind(diag.amount, row.id)
      );
    }
  }

  if (stmts.length > 0) {
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50));
    }
  }

  const failCount = diagnostics.filter(d => d.result === "null").length;

  return new Response(
    JSON.stringify({
      done: false,
      remaining: remaining - stmts.length,
      updated: stmts.length,
      processed: result.results.length,
      failed: failCount,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
