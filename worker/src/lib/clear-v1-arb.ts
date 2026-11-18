import { V1_KNOWN_ACTORS, v1EventTag, type V1Registry } from "@shared/lib/clear-v1-config";

/**
 * What arb bots make on Clear V1, and what Clear makes on them.
 *
 * A bot's tx buys the cheap stablecoin elsewhere, sells it to Clear and swaps what is left into
 * WETH, so its profit is what its own addresses hold more of at the end of the tx, less gas.
 * That is read from the receipt's Transfer logs. ETH sent to the block builder inside the tx
 * is not in a receipt, so a bot that tips that way shows a profit that is too high.
 */

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const WETH_DECIMALS = 18;
/** $1 stablecoins a bot can end with that Clear does not list. */
const EXTRA_STABLES: Record<string, number> = { "0x6b175474e89094c44da98b954eedeac495271d0f": 18 }; // DAI
const BPS = 10_000;

export const MEV_ADDRESSES: string[] = Object.entries(V1_KNOWN_ACTORS)
  .filter(([, tag]) => tag.kind === "mev").map(([a]) => a);
const MEV_SET = new Set(MEV_ADDRESSES);

export const isBotTx = (e: { actor: string | null; tx_from: string | null; tx_to: string | null }) =>
  v1EventTag(e.actor, e.tx_from, e.tx_to)?.kind === "mev";

/** The bot's own addresses in a tx: the sender, plus its contract when that is a known bot address. */
export function botAddresses(e: { actor: string | null; tx_from: string; tx_to: string | null }): string[] {
  const out = new Set([e.tx_from.toLowerCase()]);
  for (const a of [e.tx_to, e.actor]) if (a && MEV_SET.has(a.toLowerCase())) out.add(a.toLowerCase());
  return [...out];
}

const topicAddress = (topic: string) => "0x" + topic.slice(26).toLowerCase();

/** Net raw amount per token that `addresses` gained over a tx's ERC-20 Transfer logs. Zero nets are dropped. */
export function netFlows(
  logs: { address: string; topics: string[]; data: string }[], addresses: string[],
): Record<string, bigint> {
  const own = new Set(addresses.map((a) => a.toLowerCase()));
  const net = new Map<string, bigint>();
  for (const l of logs) {
    // Three topics: an ERC-721 Transfer has four, and is not an amount.
    if (l.topics[0] !== TRANSFER_TOPIC || l.topics.length !== 3) continue;
    const from = own.has(topicAddress(l.topics[1]));
    const to = own.has(topicAddress(l.topics[2]));
    if (from === to) continue;
    const amount = l.data === "0x" ? 0n : BigInt(l.data);
    const token = l.address.toLowerCase();
    net.set(token, (net.get(token) ?? 0n) + (to ? amount : -amount));
  }
  return Object.fromEntries([...net].filter(([, v]) => v !== 0n));
}

/** Decimals of the tokens counted at $1: Clear's stablecoins and their IOUs at face value, never an LP token. */
export function dollarTokens(reg: Pick<V1Registry, "tokens" | "feeds">): Record<string, number> {
  const out: Record<string, number> = { ...EXTRA_STABLES };
  for (const f of reg.feeds) if (reg.tokens[f]) out[f] = reg.tokens[f].decimals;
  for (const [address, t] of Object.entries(reg.tokens)) {
    if (t.symbol.startsWith("iou") && !t.symbol.startsWith("ioubLP")) out[address] = t.decimals;
  }
  return out;
}

export function priceFlows(flows: Record<string, bigint>, dollars: Record<string, number>, ethUsd: number) {
  let grossUsd = 0;
  let unpriced = 0;
  for (const [token, raw] of Object.entries(flows)) {
    if (token === WETH) grossUsd += (Number(raw) / 10 ** WETH_DECIMALS) * ethUsd;
    else if (dollars[token] !== undefined) grossUsd += Number(raw) / 10 ** dollars[token];
    else unpriced++;
  }
  return { grossUsd, unpriced };
}

export interface ArbSwap {
  tx_hash: string;
  timestamp: number;
  actor: string | null;
  tx_from: string;
  tx_to: string | null;
  token_in: string | null;
  token_out: string | null;
  amount_in_raw: string | null;
  amount_out_raw: string | null;
  volume_units: number | null;
  fee_treasury_units: number | null;
  fee_lp_units: number | null;
  fee_trader_units: number | null;
}

export interface BotTxRow {
  tx_hash: string;
  eth_usd: number;
  gas_eth: number;
  gross_usd: number;
}

export interface ArbStats {
  txs: number;
  /** Txs whose receipt is read: profit and gas cover these only. */
  profitTxs: number;
  volumeUsd: number;
  profitVolumeUsd: number;
  botGrossUsd: number;
  botGasUsd: number;
  botNetUsd: number;
  botNetBps: number | null;
  treasuryUsd: number;
  lpUsd: number;
  protocolUsd: number;
  protocolBps: number | null;
  rebalancerUsd: number;
  rebalancerBps: number | null;
  traderIouUsd: number;
}

export interface ArbBot extends ArbStats {
  address: string;
  label: string;
  /** False for an address only recognised by the way it calls itself. */
  known: boolean;
  lastTimestamp: number;
}

const emptyStats = (): ArbStats => ({
  txs: 0, profitTxs: 0, volumeUsd: 0, profitVolumeUsd: 0, botGrossUsd: 0, botGasUsd: 0, botNetUsd: 0, botNetBps: null,
  treasuryUsd: 0, lpUsd: 0, protocolUsd: 0, protocolBps: null, rebalancerUsd: 0, rebalancerBps: null, traderIouUsd: 0,
});

const inBps = (part: number, whole: number) => (whole > 0 ? (part / whole) * BPS : null);

const finish = <T extends ArbStats>(s: T): T => ({
  ...s,
  protocolUsd: s.treasuryUsd + s.lpUsd,
  botNetUsd: s.botGrossUsd - s.botGasUsd,
  botNetBps: inBps(s.botGrossUsd - s.botGasUsd, s.profitVolumeUsd),
  protocolBps: inBps(s.treasuryUsd + s.lpUsd, s.volumeUsd),
  rebalancerBps: inBps(s.rebalancerUsd, s.volumeUsd),
});

/**
 * One swap's redemption haircut, in $1 units: what Clear took in at par, less what it paid out
 * and the IOUs it minted. Clear books the token it receives at its redemption price, so this
 * part of the spread stays in the reserve until a rebalance takes that token out at the
 * redemption cross-rate: it is what the rebalancer earns, before its own conversion cost, if
 * it then exits at par. Negative when the swap brings in the token that redeems higher.
 * Null when a leg is not a $1 stablecoin.
 */
export function rebalancerMargin(s: ArbSwap, dollars: Record<string, number>): number | null {
  const dIn = s.token_in ? dollars[s.token_in] : undefined;
  const dOut = s.token_out ? dollars[s.token_out] : undefined;
  if (dIn === undefined || dOut === undefined || !s.amount_in_raw || !s.amount_out_raw) return null;
  const ious = (s.fee_treasury_units ?? 0) + (s.fee_lp_units ?? 0) + (s.fee_trader_units ?? 0);
  return Number(s.amount_in_raw) / 10 ** dIn - Number(s.amount_out_raw) / 10 ** dOut - ious;
}

/** Per bot and in total. `swaps` are bot swap events only; a tx counts once, at its largest leg. */
export function aggregateArb(swaps: ArbSwap[], botTxs: BotTxRow[], dollars: Record<string, number>) {
  const profit = new Map(botTxs.map((b) => [b.tx_hash, b]));
  const byTx = new Map<string, ArbSwap[]>();
  for (const s of swaps) byTx.set(s.tx_hash, [...(byTx.get(s.tx_hash) ?? []), s]);

  const bots = new Map<string, ArbBot>();
  let totals = emptyStats();
  for (const [hash, legs] of byTx) {
    const first = legs[0];
    const address = first.tx_from.toLowerCase();
    const known = [address, first.tx_to, first.actor].map((a) => (a && MEV_SET.has(a) ? V1_KNOWN_ACTORS[a] : undefined)).find(Boolean);
    const bot = bots.get(address) ?? {
      ...emptyStats(), address, label: known?.label ?? "Likely bot", known: Boolean(known), lastTimestamp: 0,
    };
    const volume = Math.max(...legs.map((l) => l.volume_units ?? 0));
    const sum = (f: (l: ArbSwap) => number) => legs.reduce((a, l) => a + f(l), 0);
    const p = profit.get(hash);
    for (const s of [bot, totals]) {
      s.txs++;
      s.volumeUsd += volume;
      s.treasuryUsd += sum((l) => l.fee_treasury_units ?? 0);
      s.lpUsd += sum((l) => l.fee_lp_units ?? 0);
      s.traderIouUsd += sum((l) => l.fee_trader_units ?? 0);
      s.rebalancerUsd += sum((l) => rebalancerMargin(l, dollars) ?? 0);
      if (p) {
        s.profitTxs++;
        s.profitVolumeUsd += volume;
        s.botGrossUsd += p.gross_usd;
        s.botGasUsd += p.gas_eth * p.eth_usd;
      }
    }
    bot.lastTimestamp = Math.max(bot.lastTimestamp, first.timestamp);
    bots.set(address, bot);
  }
  totals = finish(totals);
  return {
    totals,
    bots: [...bots.values()].map(finish).sort((a, b) => b.volumeUsd - a.volumeUsd),
  };
}
