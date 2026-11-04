import { getLastBlock, setLastBlock } from "../lib/db";
import { fetchEthPrice } from "../lib/rpc";
import { V1_DEPLOY_BLOCK, V1_GAS_WATCHLIST } from "@shared/lib/clear-v1-config";

/**
 * Gas per watched wallet from Etherscan txlist, not from event receipts: a reverted
 * keeper tx emits no logs but still burns gas. The cursor sits on the last stored tx,
 * never on the tip, so an Etherscan lag cannot lose a tx. tx_hash dedupes the overlap.
 */

const PAGE_SIZE = 1000;

interface EtherscanTx {
  hash: string; from: string; to: string; blockNumber: string; timeStamp: string;
  gasUsed: string; gasPrice: string; value: string; isError: string;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: EtherscanTx[] | string;
}

export function parseTxlist(resp: EtherscanResponse, wallet: string) {
  if (resp.status !== "1") {
    if (resp.message === "No transactions found") return [];
    throw new Error(`[clear-v1-gas] Etherscan ${resp.message}: ${String(resp.result).slice(0, 120)}`);
  }
  return (resp.result as EtherscanTx[])
    .filter((t) => t.from.toLowerCase() === wallet)
    .map((t) => ({
      tx_hash: t.hash,
      tx_to: t.to.toLowerCase(),
      block_number: Number(t.blockNumber),
      timestamp: Number(t.timeStamp),
      failed: t.isError === "1" ? 1 : 0,
      gas_used: Number(t.gasUsed),
      gas_price_gwei: Number(t.gasPrice) / 1e9,
      gas_cost_eth: (Number(t.gasUsed) * Number(t.gasPrice)) / 1e18,
      value_eth: Number(t.value) / 1e18,
    }));
}

async function fetchPage(wallet: string, startBlock: number, page: number, key: string): Promise<EtherscanResponse> {
  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${wallet}` +
    `&startblock=${startBlock}&endblock=99999999&page=${page}&offset=${PAGE_SIZE}&sort=asc&apikey=${key}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`[clear-v1-gas] Etherscan HTTP ${resp.status}`);
  return resp.json();
}

export async function syncClearV1Gas(db: D1Database, etherscanKey: string | null): Promise<void> {
  if (!etherscanKey) throw new Error("[clear-v1-gas] ETHERSCAN_API_KEY missing");
  const ethPrice = await fetchEthPrice(etherscanKey);

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO clear_v1_gas_txs
     (tx_hash, wallet, label, category, tx_to, block_number, timestamp, date, failed,
      gas_used, gas_price_gwei, gas_cost_eth, value_eth, gas_cost_usd)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  for (const w of V1_GAS_WATCHLIST) {
    const cursorKey = `clear-v1-gas:${w.address}`;
    const start = Math.max(await getLastBlock(db, cursorKey), V1_DEPLOY_BLOCK);
    let last = start;

    for (let page = 1; ; page++) {
      const resp = await fetchPage(w.address, start, page, etherscanKey);
      const rows = parseTxlist(resp, w.address);
      if (rows.length > 0) {
        const stmts = rows.map((r) => stmt.bind(
          r.tx_hash, w.address, w.label, w.category, r.tx_to, r.block_number, r.timestamp,
          new Date(r.timestamp * 1000).toISOString().slice(0, 10), r.failed, r.gas_used,
          r.gas_price_gwei, r.gas_cost_eth, r.value_eth, ethPrice ? r.gas_cost_eth * ethPrice : null,
        ));
        // A full page holds up to 1000 rows; D1 batches are chunked at 100 as in the events cron.
        for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
        for (const r of rows) last = Math.max(last, r.block_number);
      }
      const fetched = Array.isArray(resp.result) ? resp.result.length : 0;
      if (fetched < PAGE_SIZE) break;
    }

    if (last > start) await setLastBlock(db, cursorKey, last);
  }
}
