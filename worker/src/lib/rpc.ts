/**
 * Minimal JSON-RPC helpers for the paid Ethereum RPC (ROUTEMESH_RPC_URL).
 *
 * Replaces the Etherscan v2 logs/proxy endpoints in the Clear sync crons so we
 * are not bottlenecked by Etherscan's 3 req/s free-tier cap when multiple syncs
 * fire on the same cron tick.
 */

export interface RpcLog {
  blockNumber: number;
  transactionHash: string;
  topics: string[];
  data: string;
}

export interface RpcTx {
  from: string;
  to: string;
}

export interface RpcReceipt {
  from: string;
  gasUsed: number;
  effectiveGasPrice: number; // wei
}

export class RpcError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = "RpcError";
  }
}

async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs = 15_000
): Promise<T> {
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    throw new RpcError(`HTTP ${resp.status} from RPC on ${method}`);
  }
  const json = (await resp.json()) as { result?: T; error?: { code: number; message: string } };
  if (json.error) {
    throw new RpcError(`${method}: ${json.error.message}`, json.error.code);
  }
  if (json.result === undefined) {
    throw new RpcError(`${method}: empty result`);
  }
  return json.result;
}

export async function rpcGetTipBlock(rpcUrl: string): Promise<number> {
  const hex = await rpcCall<string>(rpcUrl, "eth_blockNumber", []);
  const n = parseInt(hex, 16);
  if (isNaN(n)) throw new RpcError(`eth_blockNumber: bad hex ${hex}`);
  return n;
}

export async function rpcGetLogs(
  rpcUrl: string,
  address: string,
  topic0: string,
  fromBlock: number,
  toBlock: number
): Promise<RpcLog[]> {
  const raw = await rpcCall<
    Array<{ blockNumber: string; transactionHash: string; topics: string[]; data: string }>
  >(rpcUrl, "eth_getLogs", [
    {
      address,
      topics: [topic0],
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock: "0x" + toBlock.toString(16),
    },
  ]);
  return raw.map((l) => ({
    blockNumber: parseInt(l.blockNumber, 16),
    transactionHash: l.transactionHash,
    topics: l.topics,
    data: l.data,
  }));
}

/**
 * Fetch block timestamps for the given set of block numbers.
 * Uses sequential-with-concurrency since most RPC providers (including
 * Cloudflare Workers' strict subrequest limit) prefer fewer in-flight calls.
 */
export async function rpcGetBlockTimestamps(
  rpcUrl: string,
  blockNumbers: number[],
  concurrency = 5
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const unique = [...new Set(blockNumbers)];
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (bn) => {
        try {
          const block = await rpcCall<{ timestamp: string } | null>(
            rpcUrl,
            "eth_getBlockByNumber",
            ["0x" + bn.toString(16), false]
          );
          if (block?.timestamp) {
            const ts = parseInt(block.timestamp, 16);
            if (!isNaN(ts)) out.set(bn, ts);
          }
        } catch (err) {
          console.warn(`[rpc] eth_getBlockByNumber(${bn}) failed:`, err);
        }
      })
    );
  }
  return out;
}

export async function rpcGetTx(rpcUrl: string, hash: string): Promise<RpcTx | null> {
  try {
    const r = await rpcCall<{ from?: string; to?: string } | null>(
      rpcUrl,
      "eth_getTransactionByHash",
      [hash]
    );
    if (!r?.from) return null;
    return { from: r.from.toLowerCase(), to: (r.to ?? "").toLowerCase() };
  } catch (err) {
    console.warn(`[rpc] eth_getTransactionByHash(${hash}) failed:`, err);
    return null;
  }
}

export async function rpcGetReceipt(rpcUrl: string, hash: string): Promise<RpcReceipt | null> {
  try {
    const r = await rpcCall<{
      from?: string;
      gasUsed?: string;
      effectiveGasPrice?: string;
    } | null>(rpcUrl, "eth_getTransactionReceipt", [hash]);
    if (!r?.from || !r.gasUsed || !r.effectiveGasPrice) return null;
    return {
      from: r.from.toLowerCase(),
      gasUsed: parseInt(r.gasUsed, 16),
      effectiveGasPrice: parseInt(r.effectiveGasPrice, 16),
    };
  } catch (err) {
    console.warn(`[rpc] eth_getTransactionReceipt(${hash}) failed:`, err);
    return null;
  }
}

/**
 * ETH/USD price from Etherscan's stats.ethprice module. Kept here because
 * every cron using this helper also needs USD-denominated gas costs, and
 * ethprice is still a single non-log call that fits under the Etherscan cap
 * even on a busy cron tick.
 */
export async function fetchEthPrice(etherscanKey: string | null): Promise<number | null> {
  if (!etherscanKey) return null;
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=stats&action=ethprice&apikey=${etherscanKey}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { result?: { ethusd?: string } };
    const price = parseFloat(json.result?.ethusd ?? "");
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}
