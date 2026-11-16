import { loadRegistry } from "../lib/clear-v1-registry";
import { MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";
import { rpcEthCall, rpcGetTipBlock, rpcGetTransfers, type RawLog } from "../lib/rpc";
import { stablecoinsOf } from "../cron/sync-seve-transfers";
import { SEVE_SAFES } from "@shared/lib/clear-v1-config";

/**
 * The stablecoins Sève can rebalance with, read live on Ethereum.
 *
 * Sève's capital goes round a loop: the Rebalancer Safe supplies a stablecoin to a reserve, receives
 * the over-weight one and sends it to the issuer inside the same transaction, then waits for the
 * issuer to send the first stablecoin back. So at any time the money is in one of three places:
 * in the Rebalancer Safe (ready), with the issuer (being converted), or idle in the Borrower Safe.
 *
 * "Being converted" is not a balance anywhere on-chain. It is what the Rebalancer Safe sent out,
 * to anyone but a reserve or the Borrower Safe, since the last time it was paid by anyone but those,
 * looking back `LOOKBACK_BLOCKS`: once a payment lands, everything sent before it is taken as converted.
 */

const [BORROWER, REBALANCER] = SEVE_SAFES.map((s) => s.address);
const BALANCE_OF = "0x70a08231";
/** About 33 hours, read in two log scans. A conversion older than this is taken as settled. */
const LOOKBACK_BLOCKS = 2 * MAX_BLOCKS_PER_SYNC;

export interface Holding {
  token: string;
  amount: number;
}

/** Sum of what was sent to the issuer after its last payment. Null payment block: nothing came back yet. */
export function beingConverted(sent: { block: number; amount: number }[], lastPaymentBlock: number | null): number {
  return sent.reduce((a, s) => (lastPaymentBlock === null || s.block > lastPaymentBlock ? a + s.amount : a), 0);
}

const total = (h: Holding[]) => h.reduce((a, x) => a + x.amount, 0);
const party = (topic: string) => "0x" + topic.slice(26).toLowerCase();

async function balances(rpcUrl: string, holder: string, tokens: string[], decimals: (t: string) => number): Promise<Holding[]> {
  const data = BALANCE_OF + holder.slice(2).padStart(64, "0");
  const raw = await Promise.all(tokens.map((t) => rpcEthCall(rpcUrl, t, data)));
  return raw.map((r, i) => {
    if (!/^0x[0-9a-f]{64}$/i.test(r)) throw new Error(`[seve-capital] bad balance ${r.slice(0, 80)}`);
    return { token: tokens[i], amount: Number(BigInt(r)) / 10 ** decimals(tokens[i]) };
  }).filter((h) => h.amount > 0);
}

export async function handleSeveCapital(db: D1Database, rpcUrl: string | null): Promise<Response> {
  try {
    if (!rpcUrl) throw new Error("ROUTEMESH_RPC_URL missing");
    const { registry } = await loadRegistry(db);
    const reserves = new Set(registry.reserves.map((r) => r.address));
    const tokens = stablecoinsOf(registry);
    const decimals = (t: string) => registry.tokens[t]?.decimals ?? 18;
    const outside = (address: string) => !reserves.has(address) && address !== BORROWER;

    const head = await rpcGetTipBlock(rpcUrl);
    const from = head - LOOKBACK_BLOCKS;
    const mid = from + MAX_BLOCKS_PER_SYNC;
    const scan = async (sender: string | null, receiver: string | null): Promise<RawLog[]> =>
      (await Promise.all([
        rpcGetTransfers(rpcUrl, tokens, sender, receiver, from, mid),
        rpcGetTransfers(rpcUrl, tokens, sender, receiver, mid + 1, head),
      ])).flat();
    const [ready, idle, outgoing, incoming] = await Promise.all([
      balances(rpcUrl, REBALANCER, tokens, decimals),
      balances(rpcUrl, BORROWER, tokens, decimals),
      scan(REBALANCER, null),
      scan(null, REBALANCER),
    ]);

    const payments = incoming.filter((l) => outside(party(l.topics[1]))).map((l) => parseInt(l.blockNumber, 16));
    const sent = outgoing
      .filter((l) => outside(party(l.topics[2])))
      .map((l) => ({ block: parseInt(l.blockNumber, 16), amount: Number(BigInt(l.data)) / 10 ** decimals(l.address.toLowerCase()) }));

    const body = {
      ready, readyUsd: total(ready),
      convertingUsd: beingConverted(sent, payments.length ? Math.max(...payments) : null),
      idle, idleUsd: total(idle),
      updatedAt: Math.floor(Date.now() / 1000),
    };
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, max-age=60" },
    });
  } catch (err) {
    console.error("[seve-capital]", err);
    return new Response(JSON.stringify({ error: "Unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
