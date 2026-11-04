import { rpcEthCall } from "../lib/rpc";

/**
 * Sève's Wildcat carry book. The trades are closed, so what they earned and cost is fixed
 * (seve-carry.pages.dev, ledger to 27 Oct 2026). Only the loan still moves, so it is read live.
 * Positions Sève funded on Clear V1 with the proceeds are not valued here.
 */

const PLASMA_RPC = "https://rpc.plasma.to";
const WILDCAT_MARKET = "0x74c7861c3e706e7299654f89a3c0091184aa10f0";
const TOTAL_DEBTS = "0x14a1c32d";
const TOTAL_ASSETS = "0x01e1d114";
const USDT0_DECIMALS = 6;

const SUPPLIED = 50_000;
const EARNED = { morpho: 246.81, merkl: 33.59, yzSyrup: 124.68 };
const COSTS = { swaps: 12.91, unidentified: 2.71, bridge: 2.01, redemption: 0.02 };

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export function carryBook(totalDebts: number, marketCash: number) {
  const interest = totalDebts - SUPPLIED;
  const earned = sum(EARNED);
  const costs = sum(COSTS);
  return { interest, earned, costs, owed: totalDebts - marketCash, net: earned - interest - costs };
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
    const [totalDebts, marketCash] = await Promise.all([readAmount(TOTAL_DEBTS), readAmount(TOTAL_ASSETS)]);
    return new Response(JSON.stringify({ ...carryBook(totalDebts, marketCash), updatedAt: Math.floor(Date.now() / 1000) }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    console.error("[seve-carry]", err);
    return new Response(JSON.stringify({ error: "Unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
