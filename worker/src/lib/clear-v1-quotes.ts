import { decodeErrorResult, decodeFunctionResult, encodeFunctionData, formatUnits, parseAbi, parseUnits, type Hex } from "viem";
import { rpcEthCall } from "./rpc";
import type { SpotHop, SpotRoute } from "../cron/sync-clear-v1-state";

/**
 * Quotes every stablecoin-to-stablecoin route at a fixed size by chaining the reserves' own previews,
 * the output of the first step feeding the second. A quote is what a swap would pay now; a revert is a
 * route that cannot trade, whatever isRouteOpen says (on 2026-11-09 Meta PYUSD answered isRouteOpen
 * true while previewSwap reverted DepegQuoteBelowPar).
 */

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const QUOTE_SIZE = 10_000;
const BLP_DECIMALS = 18;

const ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
  "function previewSwap(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 amountOut, uint256 iouTotal, uint256 traderIou, bool depeg)",
  "function previewDepositSingleAsset(address asset, uint256 amount) view returns (uint256 lpMinted, uint256 fee)",
  "function previewWithdrawSingleAsset(address asset, uint256 lpAmount) view returns (uint256 amountOut, uint256 fee)",
  "error OffRedemptionPrice(uint256 oraclePrice, uint256 redemptionPrice)",
  "error QuoteUnavailable(address asset, uint256 a, uint256 b)",
  "error DepegQuoteBelowPar(address asset, uint256 a, uint256 b)",
]);

export interface HopQuote {
  reserve: string;
  via: SpotHop["via"];
  /** Output of this step in its own units, null if it reverted or was not reached. */
  amountOut: number | null;
  /** Swap steps only: true when the reserve priced it on its depeg route, false at redemption price. */
  depeg: boolean | null;
  /** Revert name when the step reverted, e.g. OffRedemptionPrice. */
  error: string | null;
}

export interface SpotQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  /** What the trader receives, null when any step reverts. */
  amountOut: number | null;
  /** "depeg": every swap step on its depeg route. "redemption": a step paid at redemption price. */
  pricing: "depeg" | "redemption" | null;
  hops: HopQuote[];
}

interface Step {
  hop: Omit<SpotHop, "open">;
  amount: bigint;
}

type StepResult = { amount: bigint; depeg: boolean | null } | { error: string };

const callOf = (s: Step) => {
  const { hop: h, amount } = s;
  if (h.via === "swap") return encodeFunctionData({ abi: ABI, functionName: "previewSwap", args: [h.tokenIn as Hex, h.tokenOut as Hex, amount] });
  if (h.via === "deposit") return encodeFunctionData({ abi: ABI, functionName: "previewDepositSingleAsset", args: [h.tokenIn as Hex, amount] });
  return encodeFunctionData({ abi: ABI, functionName: "previewWithdrawSingleAsset", args: [h.tokenOut as Hex, amount] });
};

export function errorName(data: Hex): string {
  try {
    return decodeErrorResult({ abi: ABI, data }).errorName;
  } catch {
    return data.length >= 10 ? `revert ${data.slice(0, 10)}` : "revert";
  }
}

async function run(rpcUrl: string, steps: Step[]): Promise<StepResult[]> {
  if (steps.length === 0) return [];
  const data = encodeFunctionData({
    abi: ABI,
    functionName: "aggregate3",
    args: [steps.map((s) => ({ target: s.hop.reserve as Hex, allowFailure: true, callData: callOf(s) }))],
  });
  const raw = await rpcEthCall(rpcUrl, MULTICALL3, data);
  const results = decodeFunctionResult({ abi: ABI, functionName: "aggregate3", data: raw as Hex }) as readonly { success: boolean; returnData: Hex }[];
  return results.map((r, i) => {
    if (!r.success) return { error: errorName(r.returnData) };
    const fn = steps[i].hop.via === "swap" ? "previewSwap" : steps[i].hop.via === "deposit" ? "previewDepositSingleAsset" : "previewWithdrawSingleAsset";
    const out = decodeFunctionResult({ abi: ABI, functionName: fn, data: r.returnData } as never) as readonly unknown[];
    return { amount: out[0] as bigint, depeg: fn === "previewSwap" ? (out[3] as boolean) : null };
  });
}

const key = (h: Omit<SpotHop, "open">) => `${h.reserve}:${h.tokenIn}:${h.tokenOut}:${h.via}`;

/** Pure: turns per-step results into quotes. Exported for tests. */
export function assemble(
  routes: SpotRoute[],
  decimals: (token: string) => number,
  first: (h: Omit<SpotHop, "open">) => StepResult,
  second: (route: SpotRoute) => StepResult | null,
): SpotQuote[] {
  return routes.map((r) => {
    const unitsOf = (h: Omit<SpotHop, "open">, v: bigint) =>
      Number(formatUnits(v, h.tokenOut === r.tokenOut ? decimals(r.tokenOut) : BLP_DECIMALS));
    const toHop = (h: Omit<SpotHop, "open">, res: StepResult | null): HopQuote => ({
      reserve: h.reserve, via: h.via,
      amountOut: res && "amount" in res ? unitsOf(h, res.amount) : null,
      depeg: res && "amount" in res ? res.depeg : null,
      error: res && "error" in res ? res.error : null,
    });
    const r1 = first(r.hops[0]);
    const hops = [toHop(r.hops[0], r1)];
    if (r.hops[1]) hops.push(toHop(r.hops[1], "amount" in r1 ? second(r) : null));
    const done = hops.every((h) => h.amountOut !== null);
    const flags = hops.filter((h) => h.depeg !== null).map((h) => h.depeg);
    return {
      tokenIn: r.tokenIn, tokenOut: r.tokenOut, amountIn: QUOTE_SIZE,
      amountOut: done ? hops[hops.length - 1].amountOut : null,
      pricing: !done || flags.length === 0 ? null : flags.every(Boolean) ? "depeg" : "redemption",
      hops,
    };
  });
}

/** Two Multicall3 reads: every first step at QUOTE_SIZE, then each second step at the first step's output. */
export async function quoteRoutes(rpcUrl: string, routes: SpotRoute[], decimals: (token: string) => number): Promise<SpotQuote[]> {
  const firstSteps = new Map<string, Step>();
  for (const r of routes) {
    const h = r.hops[0];
    firstSteps.set(key(h), { hop: h, amount: parseUnits(String(QUOTE_SIZE), decimals(r.tokenIn)) });
  }
  const firstKeys = [...firstSteps.keys()];
  const firstResults = await run(rpcUrl, [...firstSteps.values()]);
  const firstBy = new Map(firstKeys.map((k, i) => [k, firstResults[i]]));

  const secondRoutes = routes.filter((r) => r.hops[1] && "amount" in firstBy.get(key(r.hops[0]))!);
  const secondResults = await run(rpcUrl, secondRoutes.map((r) => ({
    hop: r.hops[1],
    amount: (firstBy.get(key(r.hops[0]))! as { amount: bigint }).amount,
  })));
  const secondBy = new Map(secondRoutes.map((r, i) => [`${r.tokenIn}:${r.tokenOut}`, secondResults[i]]));

  return assemble(routes, decimals, (h) => firstBy.get(key(h))!, (r) => secondBy.get(`${r.tokenIn}:${r.tokenOut}`) ?? null);
}
