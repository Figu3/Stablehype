import { getLastBlock, setLastBlock } from "../lib/db";
import {
  fetchEthPriceChainlink, rpcGetBlockWithTxs, rpcGetNonceAt, rpcGetReceiptStrict, rpcGetTipBlock,
  type RpcBlockTx, type RpcGasReceipt,
} from "../lib/rpc";
import { V1_DEPLOY_BLOCK, V1_GAS_WATCHLIST } from "@shared/lib/clear-v1-config";

/**
 * Gas per watched EOA from its nonce, not from event receipts: a reverted keeper tx emits
 * no logs but still burns gas, and still moves the nonce. Bisecting the nonce between the
 * cursor and the safe tip finds every block holding a tx, over RouteMesh only, so this
 * cron does not compete for Etherscan's 3 calls/s on the `*\/15` tick.
 */

const CONFIRMATIONS = 12;
// Per wallet and per run. All crons of a tick share the Worker's subrequest budget.
const MAX_TX_BLOCKS_PER_RUN = 25;

export interface NonceBlock {
  block: number;
  txs: number;
}

/** Blocks in (lo, hi] where the nonce moved, earliest first, stopping at `limit`. */
export async function findNonceBlocks(
  nonceAt: (block: number) => Promise<number>,
  lo: number, nLo: number, hi: number, nHi: number, limit: number,
  out: NonceBlock[] = [],
): Promise<NonceBlock[]> {
  if (nHi === nLo || out.length >= limit) return out;
  if (hi === lo + 1) {
    out.push({ block: hi, txs: nHi - nLo });
    return out;
  }
  const mid = Math.floor((lo + hi) / 2);
  const nMid = await nonceAt(mid);
  if (nMid < nLo || nMid > nHi) {
    throw new Error(`[clear-v1-gas] nonce ${nMid} at block ${mid} is outside ${nLo}..${nHi}`);
  }
  await findNonceBlocks(nonceAt, lo, nLo, mid, nMid, limit, out);
  await findNonceBlocks(nonceAt, mid, nMid, hi, nHi, limit, out);
  return out;
}

export function toGasRow(tx: Omit<RpcBlockTx, "from">, receipt: RpcGasReceipt, blockNumber: number, timestamp: number) {
  return {
    tx_hash: tx.hash,
    tx_to: (tx.to ?? "").toLowerCase(),
    block_number: blockNumber,
    timestamp,
    failed: receipt.failed ? 1 : 0,
    gas_used: receipt.gasUsed,
    gas_price_gwei: receipt.effectiveGasPrice / 1e9,
    gas_cost_eth: (receipt.gasUsed * receipt.effectiveGasPrice) / 1e18,
    value_eth: Number(BigInt(tx.value)) / 1e18,
  };
}

export async function syncClearV1Gas(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) throw new Error("[clear-v1-gas] ROUTEMESH_RPC_URL missing");
  // INSERT OR IGNORE would leave gas_cost_usd null forever and understate USD totals.
  const ethPrice = await fetchEthPriceChainlink(rpcUrl);
  const safeTip = (await rpcGetTipBlock(rpcUrl)) - CONFIRMATIONS;

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO clear_v1_gas_txs
     (tx_hash, wallet, label, category, tx_to, block_number, timestamp, date, failed,
      gas_used, gas_price_gwei, gas_cost_eth, value_eth, gas_cost_usd)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  for (const w of V1_GAS_WATCHLIST) {
    const cursorKey = `clear-v1-gas:${w.address}`;
    const start = Math.max(await getLastBlock(db, cursorKey), V1_DEPLOY_BLOCK - 1);
    if (start >= safeTip) continue;

    const nonceAt = (block: number) => rpcGetNonceAt(rpcUrl, w.address, block);
    const [nStart, nTip] = await Promise.all([nonceAt(start), nonceAt(safeTip)]);
    if (nTip < nStart) throw new Error(`[clear-v1-gas] nonce went from ${nStart} to ${nTip} for ${w.address}`);
    const blocks = await findNonceBlocks(nonceAt, start, nStart, safeTip, nTip, MAX_TX_BLOCKS_PER_RUN);

    const stmts: D1PreparedStatement[] = [];
    for (const { block, txs } of blocks) {
      const { timestamp, transactions } = await rpcGetBlockWithTxs(rpcUrl, block);
      const sent = transactions.filter((t) => t.from.toLowerCase() === w.address);
      // A short count means a lagging node or a nonce moved by something else: do not guess.
      if (sent.length !== txs) {
        throw new Error(`[clear-v1-gas] block ${block}: found ${sent.length} txs from ${w.address}, expected ${txs}`);
      }
      const receipts = await Promise.all(sent.map((t) => rpcGetReceiptStrict(rpcUrl, t.hash)));
      sent.forEach((t, i) => {
        const r = toGasRow(t, receipts[i], block, timestamp);
        stmts.push(stmt.bind(
          r.tx_hash, w.address, w.label, w.category, r.tx_to, r.block_number, r.timestamp,
          new Date(r.timestamp * 1000).toISOString().slice(0, 10), r.failed, r.gas_used,
          r.gas_price_gwei, r.gas_cost_eth, r.value_eth, r.gas_cost_eth * ethPrice,
        ));
      });
    }

    // D1 batches are chunked at 100 as in the events cron.
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
    const capped = blocks.length >= MAX_TX_BLOCKS_PER_RUN;
    await setLastBlock(db, cursorKey, capped ? blocks[blocks.length - 1].block : safeTip);
  }
}
