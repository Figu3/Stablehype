import { decodeEventLog, formatUnits, parseAbi, type Hex } from "viem";
import { V1_POOLS, V1_TOKENS } from "@shared/lib/clear-v1-config";

export interface V1Log {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

export type V1Kind =
  | "swap" | "rebalance" | "flash_loan" | "deposit" | "withdraw"
  | "iou_mint" | "iou_redeem" | "pool_swap" | "pool_liquidity" | "admin";

export interface V1Row {
  tx_hash: string;
  log_index: number;
  block_number: number;
  contract: string;
  kind: V1Kind;
  event_name: string;
  actor: string | null;
  token_in: string | null;
  token_out: string | null;
  amount_in_raw: string | null;
  amount_out_raw: string | null;
  volume_token: string | null;
  volume_units: number | null;
  fee_token: string | null;
  fee_treasury_units: number | null;
  fee_lp_units: number | null;
  fee_trader_units: number | null;
  args_json: string;
}

export const V1_EVENTS = parseAbi([
  "event Swap(address indexed trader, address indexed tokenIn, address indexed tokenOut, address recipient, uint256 amountIn, uint256 amountOut, uint256 iouTotal, uint256 traderIOU, uint256 treasuryIOU, uint256 lpIOU)",
  "event Rebalanced(address indexed caller, address indexed tokenIn, address indexed tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  "event FlashLoan(address indexed initiator, address indexed receiver, address indexed token, uint256 amount, uint256 fee)",
  "event Deposit(address indexed caller, address indexed receiver, uint256 lpMinted, uint256[] amounts)",
  "event Deposit(address indexed caller, address indexed receiver, uint256 baseLpIn, uint256 nativeIn, uint256 metaLpMinted)",
  "event Withdraw(address indexed caller, address indexed receiver, uint256 lpBurned, uint256[] amounts)",
  "event Withdraw(address indexed caller, address indexed receiver, uint256 metaLpBurned, uint256 baseLpOut, uint256 nativeOut)",
  "event SingleAssetDeposit(address indexed caller, address indexed receiver, address indexed asset, uint256 amountIn, uint256 fee, uint256 lpMinted)",
  "event SingleAssetWithdraw(address indexed caller, address indexed receiver, address indexed asset, uint256 lpBurned, uint256 fee, uint256 amountOut)",
  "event IOUMinted(address indexed caller, address indexed asset, address indexed receiver, uint256 amount)",
  "event IOURedeemed(address indexed holder, address indexed asset, address indexed receiver, uint256 amount)",
  "event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)",
  "event TokenExchangeUnderlying(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)",
  "event AddLiquidity(address indexed provider, uint256[] token_amounts, uint256[] fees, uint256 invariant, uint256 token_supply)",
  "event RemoveLiquidity(address indexed provider, uint256[] token_amounts, uint256[] fees, uint256 token_supply)",
  "event RemoveLiquidityOne(address indexed provider, int128 token_id, uint256 token_amount, uint256 coin_amount, uint256 token_supply)",
  "event RemoveLiquidityImbalance(address indexed provider, uint256[] token_amounts, uint256[] fees, uint256 invariant, uint256 token_supply)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event PriceUpdated(address indexed asset, uint256 price, uint256 publishTime)",
  "event ClearOracleRateChanged(address indexed asset, uint256 price)",
  "event ClearIOUMinted(address indexed to, uint256 amount, uint256 treasuryFee)",
  "event ClearIOUBurned(address indexed from, uint256 amount)",
  "event Paused(address account)",
  "event Unpaused(address account)",
  "event NewClearReserve(uint256 indexed index, address indexed implementation, uint8 reserveType, address reserve, string name, string symbol, address[] tokens)",
]);

const DROPPED = new Set([
  "Transfer", "Approval", "PriceUpdated", "ClearOracleRateChanged", "ClearIOUMinted", "ClearIOUBurned",
]);

const POOLS = new Map(V1_POOLS.map((p) => [p.address, p]));

const lower = (v: unknown): string | null => (typeof v === "string" ? v.toLowerCase() : null);

function units(raw: bigint | undefined, token: string | null): number | null {
  if (raw === undefined || !token) return null;
  const meta = V1_TOKENS[token];
  return meta ? Number(formatUnits(raw, meta.decimals)) : null;
}

const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

export function decodeLog(log: V1Log): V1Row | null {
  const contract = log.address.toLowerCase();
  const base: V1Row = {
    tx_hash: log.transactionHash,
    log_index: parseInt(log.logIndex, 16),
    block_number: parseInt(log.blockNumber, 16),
    contract,
    kind: "admin",
    event_name: "unknown",
    actor: null,
    token_in: null,
    token_out: null,
    amount_in_raw: null,
    amount_out_raw: null,
    volume_token: null,
    volume_units: null,
    fee_token: null,
    fee_treasury_units: null,
    fee_lp_units: null,
    fee_trader_units: null,
    args_json: json({ topics: log.topics, data: log.data }),
  };

  let name: string;
  let a: Record<string, unknown>;
  try {
    const d = decodeEventLog({
      abi: V1_EVENTS,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data as Hex,
    });
    name = d.eventName;
    a = d.args as unknown as Record<string, unknown>;
  } catch {
    return base; // unknown topic: keep raw so a contract change cannot silently drop events
  }

  if (DROPPED.has(name)) return null;

  const row: V1Row = { ...base, event_name: name, args_json: json(a) };
  const big = (k: string) => a[k] as bigint | undefined;

  switch (name) {
    case "Swap": {
      const tokenIn = lower(a.tokenIn);
      const tokenOut = lower(a.tokenOut);
      return {
        ...row,
        kind: "swap",
        actor: lower(a.trader),
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in_raw: String(a.amountIn),
        amount_out_raw: String(a.amountOut),
        volume_token: tokenOut,
        volume_units: units(big("amountOut"), tokenOut),
        fee_token: tokenIn, // IOU fields are in tokenIn units
        fee_treasury_units: units(big("treasuryIOU"), tokenIn),
        fee_lp_units: units(big("lpIOU"), tokenIn),
        fee_trader_units: units(big("traderIOU"), tokenIn),
      };
    }
    case "Rebalanced": {
      const tokenOut = lower(a.tokenOut);
      return {
        ...row,
        kind: "rebalance",
        actor: lower(a.caller),
        token_in: lower(a.tokenIn),
        token_out: tokenOut,
        amount_in_raw: String(a.amountIn),
        amount_out_raw: String(a.amountOut),
        volume_token: tokenOut,
        volume_units: units(big("amountOut"), tokenOut),
      };
    }
    case "FlashLoan": {
      const token = lower(a.token);
      return {
        ...row,
        kind: "flash_loan",
        actor: lower(a.initiator),
        token_in: token,
        amount_in_raw: String(a.amount),
        volume_token: token,
        volume_units: units(big("amount"), token),
        fee_token: token,
        fee_lp_units: units(big("fee"), token), // stays in the reserve, accrues to LPs via NAV
      };
    }
    case "SingleAssetDeposit": {
      const asset = lower(a.asset);
      return {
        ...row,
        kind: "deposit",
        actor: lower(a.caller),
        token_in: asset,
        amount_in_raw: String(a.amountIn),
        volume_token: asset,
        volume_units: units(big("amountIn"), asset),
        fee_token: asset,
        fee_treasury_units: units(big("fee"), asset), // pushed to the treasury as real tokens
      };
    }
    case "SingleAssetWithdraw": {
      const asset = lower(a.asset);
      return {
        ...row,
        kind: "withdraw",
        actor: lower(a.caller),
        token_out: asset,
        amount_out_raw: String(a.amountOut),
        volume_token: asset,
        volume_units: units(big("amountOut"), asset),
        fee_token: asset,
        fee_treasury_units: units(big("fee"), asset),
      };
    }
    case "Deposit":
      return { ...row, kind: "deposit", actor: lower(a.caller) };
    case "Withdraw":
      return { ...row, kind: "withdraw", actor: lower(a.caller) };
    case "IOUMinted":
    case "IOURedeemed": {
      const asset = lower(a.asset);
      return {
        ...row,
        kind: name === "IOUMinted" ? "iou_mint" : "iou_redeem",
        actor: lower(a.caller ?? a.holder),
        token_in: asset,
        amount_in_raw: String(a.amount),
        volume_token: asset,
        volume_units: units(big("amount"), asset),
      };
    }
    case "TokenExchange":
    case "TokenExchangeUnderlying": {
      const pool = POOLS.get(contract);
      // Underlying ids index [coin0, ...base pool coins], not the pool's own coins.
      const coins = pool && name === "TokenExchangeUnderlying" ? [pool.coins[0], ...V1_POOLS[0].coins] : pool?.coins;
      const tokenIn = coins?.[Number(a.sold_id)] ?? null;
      const tokenOut = coins?.[Number(a.bought_id)] ?? null;
      return {
        ...row,
        kind: "pool_swap",
        actor: lower(a.buyer),
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in_raw: String(a.tokens_sold),
        amount_out_raw: String(a.tokens_bought),
        volume_token: tokenOut,
        volume_units: units(big("tokens_bought"), tokenOut),
      };
    }
    case "AddLiquidity":
    case "RemoveLiquidity":
    case "RemoveLiquidityOne":
    case "RemoveLiquidityImbalance":
      return { ...row, kind: "pool_liquidity", actor: lower(a.provider) };
    default:
      return row; // Paused, Unpaused
  }
}
