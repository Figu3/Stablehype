import { describe, expect, it } from "vitest";
import { toV1Transactions } from "../use-clear-transactions";
import type { ClearV1Event } from "../use-clear-v1";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const event = (o: Partial<ClearV1Event>): ClearV1Event => ({
  tx_hash: "0xa", log_index: 1, block_number: 10, timestamp: 1762000000, contract: "0xc", kind: "swap",
  event_name: "Swap", actor: "0xd", tx_from: "0xe", tx_to: "0xf", token_in: USDT, token_out: USDC,
  volume_token: USDC, volume_units: 420, ...o,
});

describe("toV1Transactions", () => {
  it("maps a swap with symbols and par amounts", () => {
    const [t] = toV1Transactions([event({})]);
    expect(t).toMatchObject({ v1: true, type: "swap", amountInUsd: 420 });
    expect(t.tokenIn.symbol).toBe("USDT");
    expect(t.tokenOut.symbol).toBe("USDC");
  });
  it("counts a swap logged by two reserves once", () => {
    expect(toV1Transactions([event({ log_index: 1 }), event({ log_index: 2 })])).toHaveLength(1);
  });
  it("tags a known swapper by actor, then by tx sender, and leaves strangers untagged", () => {
    const arb = "0xa4719f7dd3bd2ab980c7938d90c6b29e12361d96";
    const c0ffee = "0xC0ffeEBABE5D496B2DDE509f9fa189C25cF29671";
    const r = toV1Transactions([
      event({ tx_hash: "0x1", actor: arb }),
      event({ tx_hash: "0x2", tx_from: c0ffee }),
      event({ tx_hash: "0x3" }),
    ]);
    expect(r.map((t) => t.tag?.label ?? null)).toEqual(["Flash arb bot", "c0ffeebabe.eth", null]);
  });
  it("names a swap's origin from the contract its tx called", () => {
    const kyber = "0x6131B5fAE19EA4f9D964eAc0408E4408b66337b5";
    const router = "0x0c431a85fdfedccf63692d47f34cce4db17566aa";
    const r = toV1Transactions([
      event({ tx_hash: "0x1", tx_to: kyber }),
      event({ tx_hash: "0x2", tx_to: router }),
      event({ tx_hash: "0x3", tx_to: "0xc" }), // the emitting reserve itself
      event({ tx_hash: "0x4", tx_to: "0x9008d19f58aabd9ed0d60971565aa8510560ab41" }),
      event({ tx_hash: "0x5", tx_to: "0xf" }),
      event({ tx_hash: "0x6", tx_to: null }),
    ]);
    expect(r.map((t) => t.origin ? `${t.origin.kind}:${t.origin.label}` : null)).toEqual([
      "integration:KyberSwap", "direct:Direct", "direct:Direct", "discovered:CoW", "other:Other", null,
    ]);
  });
  it("still tags a KyberSwap-routed swap for the activity feed", () => {
    const [t] = toV1Transactions([event({ tx_to: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5" })]);
    expect(t.tag).toEqual({ label: "KyberSwap", kind: "aggregator" });
  });
  it("gives rebalances no origin", () => {
    const [t] = toV1Transactions([event({ kind: "rebalance" })]);
    expect(t.origin).toBeUndefined();
  });
  it("keeps distinct txs and maps rebalances", () => {
    const r = toV1Transactions([event({}), event({ tx_hash: "0xb", kind: "rebalance" })]);
    expect(r.map((t) => t.type)).toEqual(["swap", "rebalance"]);
  });
});
