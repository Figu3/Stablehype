import { describe, expect, it } from "vitest";
import { aggregateArb, botAddresses, dollarTokens, isBotTx, netFlows, priceFlows, rebalancerMargin, type ArbSwap } from "../clear-v1-arb";
import { V1_STATIC } from "@shared/lib/clear-v1-config";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const IOU_USDT = "0x20beb4673f12f6ac7f9c2927141b80937cca4048";
const BLP = "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d";
const BOT = "0xf1c1387cac4ba8c93e239feef94799c3eadf319b";
const POOL = "0xe0554a476a092703abdb3ef35c80e0d76d32939f";
const C0FFEE_EOA = "0xc0ffeebabe5d496b2dde509f9fa189c25cf29671";
const C0FFEE_CONTRACT = "0xe08d97e151473a848c3d9ca3f323cb720472d015";

const topic = (a: string) => "0x" + a.slice(2).padStart(64, "0");
const transfer = (token: string, from: string, to: string, amount: bigint) => ({
  address: token, topics: [TRANSFER, topic(from), topic(to)], data: "0x" + amount.toString(16).padStart(64, "0"),
});
const dollars = dollarTokens(V1_STATIC);

// Tx 0xfbf582a7…: 5,933.443103 USDT in, 5,927.740004 USDC out, 1.641825 iouUSDT minted.
const swap = (over: Partial<ArbSwap> = {}): ArbSwap => ({
  tx_hash: "0xa", timestamp: 100, actor: "0x0c431a85fdfedccf63692d47f34cce4db17566aa", tx_from: BOT, tx_to: BOT,
  token_in: USDT, token_out: USDC, amount_in_raw: "5933443103", amount_out_raw: "5927740004",
  volume_units: 5927.740004, fee_treasury_units: 1.09455, fee_lp_units: 0.547275, fee_trader_units: 0, ...over,
});

describe("netFlows", () => {
  it("nets what the bot's addresses gained and ignores the rest", () => {
    const flows = netFlows([
      transfer(USDC, BOT, POOL, 6_000_000n),
      transfer(USDC, POOL, BOT, 6_000_000n),
      transfer(WETH, POOL, BOT, 268759933931549n),
      transfer(USDT, POOL, C0FFEE_EOA, 5n),
    ], [BOT]);
    expect(flows).toEqual({ [WETH]: 268759933931549n });
  });
  it("skips a transfer between two of the bot's own addresses and an NFT transfer", () => {
    const nft = { address: WETH, topics: [TRANSFER, topic(POOL), topic(BOT), topic(BOT)], data: "0x" };
    expect(netFlows([transfer(WETH, C0FFEE_CONTRACT, C0FFEE_EOA, 9n), nft], [C0FFEE_EOA, C0FFEE_CONTRACT, BOT])).toEqual({});
  });
});

describe("priceFlows", () => {
  it("prices WETH at the ETH price and stablecoins and IOUs at $1", () => {
    const r = priceFlows({ [WETH]: 10n ** 15n, [IOU_USDT]: 1_500_000n, [USDT]: -1n }, dollars, 3000);
    expect(r.grossUsd).toBeCloseTo(3 + 1.5 - 0.000001, 9);
    expect(r.unpriced).toBe(0);
  });
  it("leaves an LP token and an unknown token unpriced", () => {
    expect(priceFlows({ [BLP]: 10n ** 18n, "0xdead": 5n }, dollars, 3000)).toEqual({ grossUsd: 0, unpriced: 2 });
  });
});

describe("bot identity", () => {
  it("counts the known contract of a known bot, not a router", () => {
    expect(botAddresses({ actor: C0FFEE_CONTRACT, tx_from: C0FFEE_EOA, tx_to: C0FFEE_CONTRACT })).toEqual([C0FFEE_EOA, C0FFEE_CONTRACT]);
    expect(botAddresses({ actor: "0x0c431a85fdfedccf63692d47f34cce4db17566aa", tx_from: BOT, tx_to: BOT })).toEqual([BOT]);
  });
  it("takes a self-calling sender for a bot, and not a user going through a router", () => {
    expect(isBotTx({ actor: null, tx_from: BOT, tx_to: BOT })).toBe(true);
    expect(isBotTx({ actor: BOT, tx_from: BOT, tx_to: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5" })).toBe(false);
  });
});

describe("rebalancerMargin", () => {
  it("is the spread left after the IOUs", () => {
    expect(rebalancerMargin(swap(), dollars)).toBeCloseTo(5933.443103 - 5927.740004 - 1.641825, 6);
  });
  it("is null when a leg is an LP token", () => {
    expect(rebalancerMargin(swap({ token_out: BLP }), dollars)).toBeNull();
  });
});

describe("aggregateArb", () => {
  it("sums per bot and in total, with profit only over txs whose receipt is read", () => {
    const swaps = [
      swap(),
      swap({ tx_hash: "0xb", timestamp: 200 }),
      swap({ tx_hash: "0xc", tx_from: C0FFEE_EOA, tx_to: C0FFEE_CONTRACT, actor: C0FFEE_CONTRACT }),
    ];
    const r = aggregateArb(swaps, [{ tx_hash: "0xa", eth_usd: 3000, gas_eth: 0.0001, gross_usd: 0.8 }], dollars);
    expect(r.bots.map((b) => [b.address, b.label, b.known, b.txs])).toEqual([
      [BOT, "Likely bot", false, 2],
      [C0FFEE_EOA, "c0ffeebabe.eth", true, 1],
    ]);
    const bot = r.bots[0];
    expect(bot.lastTimestamp).toBe(200);
    expect(bot.profitTxs).toBe(1);
    expect(bot.botNetUsd).toBeCloseTo(0.5, 9);
    expect(bot.botNetBps).toBeCloseTo((0.5 / 5927.740004) * 10_000, 6);
    expect(bot.protocolUsd).toBeCloseTo(2 * 1.641825, 6);
    expect(bot.protocolBps).toBeCloseTo((1.641825 / 5927.740004) * 10_000, 6);
    expect(r.bots[1].botNetBps).toBeNull();
    expect(r.totals.txs).toBe(3);
    expect(r.totals.rebalancerUsd).toBeCloseTo(3 * 4.061274, 5);
  });
  it("counts a two-leg tx once, at its largest leg, with both legs' fees", () => {
    const r = aggregateArb([swap(), swap({ volume_units: 100 })], [], dollars);
    expect(r.totals.txs).toBe(1);
    expect(r.totals.volumeUsd).toBeCloseTo(5927.740004, 6);
    expect(r.totals.treasuryUsd).toBeCloseTo(2 * 1.09455, 6);
  });
});
