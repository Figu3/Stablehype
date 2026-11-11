import { rpcEthCall } from "../lib/rpc";

/**
 * Sève's Wildcat loan and carry book. The carry trades are closed, so what they earned and cost
 * is fixed (seve-carry.pages.dev, ledger to 27 Oct 2026). The loan still moves, so it is read live.
 * Since 6 Nov 2026 it also funds Sève's Clear V1 positions, which are not valued here.
 */

const PLASMA_RPC = "https://rpc.plasma.to";
const WILDCAT_MARKET = "0x74c7861c3e706e7299654f89a3c0091184aa10f0";
const TOTAL_DEBTS = "0x14a1c32d";
const TOTAL_ASSETS = "0x01e1d114";
const SCALED_TOTAL_SUPPLY = "0xb1bf962d";
const USDT0_DECIMALS = 6;

/**
 * What lenders put in, from the market's Deposit logs: USDT0 in and market tokens minted.
 * Interest is debt less this principal, so a deposit or withdrawal missing here would be
 * counted as interest. `carryBook` checks the minted total against the market before it trusts it.
 */
const DEPOSITS = [
  // The first lending, not traced log by log: the scaled amount is the market's supply just
  // before the next deposit, and the amount is the principal the closed carry ledger used.
  { date: null, amount: 50_000, scaled: 49_999.807887 },
  // 0x30686b7f28864d45ade33475d852d0b6d21f936018994bca1112bb95bafb0f84
  { date: "2026-11-06", amount: 100_000, scaled: 98_918.00272 },
];
const SCALED_TOLERANCE = 0.01;
const EARNED = { morpho: 246.81, merkl: 33.59, yzSyrup: 124.68 };
const COSTS = { swaps: 12.91, unidentified: 2.71, bridge: 2.01, redemption: 0.02 };

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export function carryBook(totalDebts: number, marketCash: number, scaledSupply: number, deposits = DEPOSITS) {
  const earned = sum(EARNED);
  const costs = sum(COSTS);
  const principal = deposits.reduce((a, d) => a + d.amount, 0);
  // The ledger is whole only if it accounts for every market token outstanding. If not, a
  // deposit or withdrawal happened that it does not know, and interest is unknown, not a guess.
  const ledgerCurrent = Math.abs(scaledSupply - deposits.reduce((a, d) => a + d.scaled, 0)) <= SCALED_TOLERANCE;
  const interest = ledgerCurrent ? totalDebts - principal : null;
  return {
    principal: ledgerCurrent ? principal : null,
    interest, earned, costs,
    debt: totalDebts,
    // Drawn by Sève: what the market owes its lenders less the cash sitting in it.
    owed: totalDebts - marketCash,
    net: interest === null ? null : earned - interest - costs,
  };
}

async function readAmount(selector: string): Promise<number> {
  const raw: unknown = await rpcEthCall(PLASMA_RPC, WILDCAT_MARKET, selector);
  if (typeof raw !== "string" || !/^0x[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(`[seve-carry] bad result ${JSON.stringify(raw).slice(0, 200)}`);
  }
  return Number(BigInt(raw)) / 10 ** USDT0_DECIMALS;
}

export async function handleSeveCarry(): Promise<Response> {
  try {
    const [totalDebts, marketCash, scaledSupply] = await Promise.all([
      readAmount(TOTAL_DEBTS), readAmount(TOTAL_ASSETS), readAmount(SCALED_TOTAL_SUPPLY),
    ]);
    return new Response(JSON.stringify({ ...carryBook(totalDebts, marketCash, scaledSupply), updatedAt: Math.floor(Date.now() / 1000) }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    console.error("[seve-carry]", err);
    return new Response(JSON.stringify({ error: "Unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
