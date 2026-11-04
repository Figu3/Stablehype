import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, pad, toEventSelector } from "viem";
import { decodeLog, V1_EVENTS, type V1Log } from "../clear-v1-decode";
import fx from "./fixtures/clear-v1-logs.json";

const BASE = "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d";
const META = "0x4ff500233d1898ae2ac5ad61296780ba35dcaed4";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const PYUSD = "0x6c3ea9036406852006290770bedfcaba0e23a0e8";
const TRADER = "0x00000000000000000000000000000000000000aa";

const swapLog = (address: string, tokenIn: string, tokenOut: string, a: bigint[]): V1Log => ({
  address,
  topics: encodeEventTopics({
    abi: V1_EVENTS,
    eventName: "Swap",
    args: { trader: TRADER, tokenIn, tokenOut } as never,
  }) as string[],
  data: encodeAbiParameters(
    [{ type: "address" }, ...a.map(() => ({ type: "uint256" }))],
    [TRADER, ...a] as never,
  ),
  blockNumber: "0x1",
  transactionHash: "0xabc",
  logIndex: "0x0",
});

describe("decodeLog", () => {
  it("decodes a Base deposit from a real log", () => {
    const row = decodeLog(fx.base_deposit as V1Log);
    expect(row?.kind).toBe("deposit");
    expect(row?.actor).toMatch(/^0x[0-9a-f]{40}$/);
  });
  it("decodes a Meta deposit despite the different signature", () => {
    expect(decodeLog(fx.meta_deposit as V1Log)?.kind).toBe("deposit");
  });
  it("decodes a Curve exchange using the pool's coin order", () => {
    const row = decodeLog(fx.exchange as V1Log);
    expect(row?.kind).toBe("pool_swap");
    expect(row?.token_in).toBe(USDT);
    expect(row?.token_out).toBe(USDC);
    expect(row?.amount_in_raw).toBe("5323842");
  });
  it("classifies mint, liquidity and pause", () => {
    expect(decodeLog(fx.iou as V1Log)?.kind).toBe("iou_mint");
    expect(decodeLog(fx.addliq as V1Log)?.kind).toBe("pool_liquidity");
    expect(decodeLog(fx.paused as V1Log)?.kind).toBe("admin");
  });
  it("drops noise events", () => {
    expect(decodeLog(fx.price as V1Log)).toBeNull();
    expect(decodeLog(fx.transfer as V1Log)).toBeNull();
  });
  it("keeps an unknown topic as admin with the raw topic", () => {
    const row = decodeLog({ ...(fx.paused as V1Log), topics: ["0xdead"] });
    expect(row?.kind).toBe("admin");
    expect(row?.event_name).toBe("unknown");
    expect(row?.args_json).toContain("0xdead");
  });
  it("drops the IOU echo events and Approval", () => {
    const pad = "0x" + "00".repeat(32);
    for (const [eventName, indexed] of [["ClearIOUMinted", 1], ["ClearIOUBurned", 1], ["Approval", 2]] as const) {
      const topics = [...(encodeEventTopics({ abi: V1_EVENTS, eventName }) as string[]), ...Array(indexed).fill(pad)];
      const log = { ...(fx.paused as V1Log), topics, data: "0x" + "00".repeat(64) };
      expect(decodeLog(log)).toBeNull();
    }
  });
  it("maps TokenExchangeUnderlying ids to the base pool coins with their decimals", () => {
    const row = decodeLog({
      address: "0x7d516bd28bfa5c3127813316693a605f25c4dfd8", // iouPYUSD / clrUSD
      topics: encodeEventTopics({ abi: V1_EVENTS, eventName: "TokenExchangeUnderlying", args: { buyer: TRADER } as never }) as string[],
      data: encodeAbiParameters(
        [{ type: "int128" }, { type: "uint256" }, { type: "int128" }, { type: "uint256" }],
        [0n, 2_000_000n, 1n, 1_990_000n],
      ),
      blockNumber: "0x1", transactionHash: "0xabc", logIndex: "0x0",
    });
    expect(row?.token_out).toBe(USDC);
    expect(row?.volume_units).toBeCloseTo(1.99, 6);
  });
  it("splits fees so the parts sum to iouTotal", () => {
    const row = decodeLog(swapLog(BASE, USDC, USDT, [1_000_000n, 999_000n, 1000n, 200n, 400n, 400n]));
    const sum = row!.fee_trader_units! + row!.fee_treasury_units! + row!.fee_lp_units!;
    expect(sum).toBeCloseTo(0.001, 8);
  });
  it("uses tokenIn decimals for fees on a 6-decimal swap", () => {
    const row = decodeLog(swapLog(BASE, USDC, USDT, [1_000_000n, 999_700n, 300n, 0n, 150n, 150n]));
    expect(row?.kind).toBe("swap");
    expect(row?.volume_token).toBe(USDT);
    expect(row?.volume_units).toBeCloseTo(0.9997, 6);
    expect(row?.fee_token).toBe(USDC);
    expect(row?.fee_treasury_units).toBeCloseTo(0.00015, 8);
    expect(row?.fee_lp_units).toBeCloseTo(0.00015, 8);
  });
  it("uses 18 decimals for a bLP tokenIn", () => {
    const row = decodeLog(swapLog(META, BASE, PYUSD, [10n ** 18n, 999_000n, 3n * 10n ** 14n, 0n, 10n ** 14n, 2n * 10n ** 14n]));
    expect(row?.fee_token).toBe(BASE);
    expect(row?.fee_treasury_units).toBeCloseTo(0.0001, 8);
    expect(row?.volume_units).toBeCloseTo(0.999, 6);
  });
  it("leaves units null for an unknown token but keeps raw", () => {
    const row = decodeLog(swapLog(BASE, TRADER, USDT, [5n, 5n, 0n, 0n, 0n, 0n]));
    expect(row?.fee_treasury_units).toBeNull();
    expect(row?.amount_in_raw).toBe("5");
  });
  const mk = (address: string, eventName: string, args: object, types: object[], values: unknown[]): V1Log => ({
    address,
    topics: encodeEventTopics({ abi: V1_EVENTS, eventName, args } as never) as string[],
    data: encodeAbiParameters(types as never, values as never),
    blockNumber: "0x1",
    transactionHash: "0xabc",
    logIndex: "0x0",
  });

  it("decodes NewClearReserve as admin with the reserve in args_json", () => {
    const reserve = "0x00000000000000000000000000000000000000bb";
    const row = decodeLog(
      mk(
        "0x2b2a51bbf9d3794490b9edda1b2b46d5aefd0a95",
        "NewClearReserve",
        { index: 1n, implementation: "0x00000000000000000000000000000000000000cc" },
        [{ type: "uint8" }, { type: "address" }, { type: "string" }, { type: "string" }, { type: "address[]" }],
        [1, reserve, "Reserve", "RSV", [USDC, USDT]],
      ),
    );
    expect(row?.kind).toBe("admin");
    expect(row?.event_name).toBe("NewClearReserve");
    expect(row?.args_json).toContain("reserve");
    expect(row?.args_json).toContain(reserve);
  });
  it("decodes Rebalanced", () => {
    const row = decodeLog(
      mk(BASE, "Rebalanced", { caller: TRADER, tokenIn: USDC, tokenOut: USDT },
        [{ type: "address" }, { type: "uint256" }, { type: "uint256" }], [TRADER, 2_000_000n, 1_990_000n]),
    );
    expect(row?.kind).toBe("rebalance");
    expect(row?.actor).toBe(TRADER);
    expect(row?.token_in).toBe(USDC);
    expect(row?.token_out).toBe(USDT);
    expect(row?.amount_in_raw).toBe("2000000");
    expect(row?.volume_token).toBe(USDT);
    expect(row?.volume_units).toBeCloseTo(1.99, 6);
  });
  it("decodes FlashLoan with the fee in fee_lp_units", () => {
    const row = decodeLog(
      mk(BASE, "FlashLoan", { initiator: TRADER, receiver: TRADER, token: USDC },
        [{ type: "uint256" }, { type: "uint256" }], [10_000_000n, 5_000n]),
    );
    expect(row?.kind).toBe("flash_loan");
    expect(row?.volume_units).toBeCloseTo(10, 6);
    expect(row?.fee_token).toBe(USDC);
    expect(row?.fee_lp_units).toBeCloseTo(0.005, 8);
    expect(row?.fee_treasury_units).toBeNull();
  });
  it("decodes SingleAssetDeposit with the fee in fee_treasury_units", () => {
    const row = decodeLog(
      mk(BASE, "SingleAssetDeposit", { caller: TRADER, receiver: TRADER, asset: USDC },
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [3_000_000n, 1_500n, 2n * 10n ** 18n]),
    );
    expect(row?.kind).toBe("deposit");
    expect(row?.token_in).toBe(USDC);
    expect(row?.volume_units).toBeCloseTo(3, 6);
    expect(row?.fee_treasury_units).toBeCloseTo(0.0015, 8);
    expect(row?.fee_lp_units).toBeNull();
  });
  it("decodes Withdraw", () => {
    const row = decodeLog(
      mk(BASE, "Withdraw", { caller: TRADER, receiver: TRADER },
        [{ type: "uint256" }, { type: "uint256[]" }], [10n ** 18n, [500_000n, 500_000n]]),
    );
    expect(row?.kind).toBe("withdraw");
    expect(row?.event_name).toBe("Withdraw");
    expect(row?.actor).toBe(TRADER);
  });
  it("decodes the Meta 5-argument Withdraw overload", () => {
    // eventName "Withdraw" is ambiguous between overloads, so build topic0 from the signature.
    const topic0 = toEventSelector(
      "Withdraw(address,address,uint256,uint256,uint256)",
    );
    const row = decodeLog({
      address: META,
      topics: [topic0, pad(TRADER, { size: 32 }), pad(TRADER, { size: 32 })],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [10n ** 18n, 400_000n, 600_000n],
      ),
      blockNumber: "0x1",
      transactionHash: "0xabc",
      logIndex: "0x0",
    });
    expect(row?.kind).toBe("withdraw");
    expect(row?.event_name).toBe("Withdraw");
    expect(row?.actor).toBe(TRADER);
  });
});
