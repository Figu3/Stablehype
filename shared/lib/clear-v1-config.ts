/**
 * Clear V1 mainnet addresses. Source of truth: .claude/registry/contracts.json, verified on-chain 2026-11-04.
 * Meta GHO (factory reserve id 4, block 26355428) verified on-chain 2026-11-09.
 * All addresses lowercase. Key everything by address: the 4 ioubLP tokens share one symbol.
 */

export const V1_DEPLOY_BLOCK = 26278245;

export const V1_ORACLE = "0x323f9737f4a2763fa419bd679ce0d7a2bc322a30";
export const V1_ADAPTER = "0x39b548e590ec3b6333a200fa715f9eab04f76858";
export const V1_ROUTER = "0x0c431a85fdfedccf63692d47f34cce4db17566aa";
export const V1_FACTORY = "0x2b2a51bbf9d3794490b9edda1b2b46d5aefd0a95";
export const V1_ACCESS_MANAGER = "0x5601d10ab86d2b119f169232baab39b317dd498e";
export const V1_CURVE_FACTORY = "0xa671f7f070b6848ec0f0b83d6c7556e671327935";
export const V1_POOL_DEPLOYER = "0xfc68a38e82308bc809612892062b440658c5e89f";

export const V1_BASE_RESERVE = "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d";
const CLR_USD = "0xb9ca6ea808f54576ae6350c266469e35e099ea6d";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const PYUSD = "0x6c3ea9036406852006290770bedfcaba0e23a0e8";
const USDG = "0xe343167631d89b6ffc58b88d6b7fb0228795491d";
const USDS = "0xdc035d45d973e3ec169d2276ddab16f1e407384f";
const GHO = "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f";

export interface V1Reserve {
  address: string;
  label: string;
  kind: "base" | "meta";
  /** Tokens the reserve swaps between: isRouteOpen is read for every ordered pair. */
  legs: string[];
}

export const V1_RESERVES: V1Reserve[] = [
  { address: V1_BASE_RESERVE, label: "Base LP", kind: "base", legs: [USDC, USDT] },
  { address: "0x4ff500233d1898ae2ac5ad61296780ba35dcaed4", label: "Meta PYUSD", kind: "meta", legs: [PYUSD, V1_BASE_RESERVE] },
  { address: "0xd09f313a9b6f3136935cebda26178933fd7973cd", label: "Meta USDG", kind: "meta", legs: [USDG, V1_BASE_RESERVE] },
  { address: "0x070f56b62e3352d6d8fa52024bbf4c51d6917317", label: "Meta USDS", kind: "meta", legs: [USDS, V1_BASE_RESERVE] },
  { address: "0x15954f33c25828156f8d8f1de564e1e48889197f", label: "Meta GHO", kind: "meta", legs: [GHO, V1_BASE_RESERVE] },
];

export interface V1Token {
  symbol: string;
  decimals: number;
}

export const V1_TOKENS: Record<string, V1Token> = {
  [USDC]: { symbol: "USDC", decimals: 6 },
  [USDT]: { symbol: "USDT", decimals: 6 },
  [PYUSD]: { symbol: "PYUSD", decimals: 6 },
  [USDG]: { symbol: "USDG", decimals: 6 },
  [USDS]: { symbol: "USDS", decimals: 18 },
  [GHO]: { symbol: "GHO", decimals: 18 },
  [V1_BASE_RESERVE]: { symbol: "bLP", decimals: 18 },
  [CLR_USD]: { symbol: "clrUSD", decimals: 18 },
  "0x32d32646f13a537d95742f5dd4c4ea3ab941d598": { symbol: "iouUSDC", decimals: 6 },
  "0x20beb4673f12f6ac7f9c2927141b80937cca4048": { symbol: "iouUSDT", decimals: 6 },
  "0x5f25883365a796619c5b7b63166748779d85e650": { symbol: "iouPYUSD", decimals: 6 },
  "0x62c175cfb14942e2cd0076da8e17c0e166a4f129": { symbol: "iouUSDG", decimals: 6 },
  "0x5ff89ece8d85df7033dda4dc4271553be1197cda": { symbol: "iouUSDS", decimals: 18 },
  "0x79fc316accbb526e7833bc4dbb98d79e5fc743f2": { symbol: "ioubLP (PYUSD)", decimals: 18 },
  "0x80ba609711f344f12551d14f2fa7836829896589": { symbol: "ioubLP (USDG)", decimals: 18 },
  "0xa44fd913be3ef82eebdcb2989e1587b70e279b25": { symbol: "ioubLP (USDS)", decimals: 18 },
  "0xe10eebaacddf81d1bd92a7c38e7555f94107742d": { symbol: "iouGHO", decimals: 18 },
  "0x4ada21212a165ac805b7bae7bbd80f03be824771": { symbol: "ioubLP (GHO)", decimals: 18 },
};

export interface V1Pool {
  address: string;
  label: string;
  coins: [string, string];
}

const meta = (address: string, coin: string): V1Pool => ({
  address,
  label: `${V1_TOKENS[coin].symbol} / clrUSD`,
  coins: [coin, CLR_USD],
});

// coins() order verified on-chain 2026-11-04.
export const V1_POOLS: V1Pool[] = [
  { address: CLR_USD, label: "USDC / USDT (clrUSD)", coins: [USDC, USDT] },
  meta("0xf97d77f833daeab3efb3c348765a725757f46ae6", "0x32d32646f13a537d95742f5dd4c4ea3ab941d598"),
  meta("0xa421bf8ffebacb505991bbc528b4efbb3752ef71", "0x20beb4673f12f6ac7f9c2927141b80937cca4048"),
  meta("0x7d516bd28bfa5c3127813316693a605f25c4dfd8", "0x5f25883365a796619c5b7b63166748779d85e650"),
  meta("0xc9bdd0638a00e60f75dc0a71308ad88020032e47", "0x62c175cfb14942e2cd0076da8e17c0e166a4f129"),
  meta("0x7fd9f0b476ae5b7376370289f6f62c10b74a5965", "0x5ff89ece8d85df7033dda4dc4271553be1197cda"),
  meta("0x0823643ce50c331aafc097a85353c4bd4cc59d1c", "0x79fc316accbb526e7833bc4dbb98d79e5fc743f2"),
  meta("0x2355230b10e4530a7350bd0e8e82cfeccae37c2b", "0x80ba609711f344f12551d14f2fa7836829896589"),
  meta("0xfccfa247736ed8cfe66d52bcb6094083840666ba", "0xa44fd913be3ef82eebdcb2989e1587b70e279b25"),
  meta("0xe48f42c6c63e3577bf46c9f542b8806a67561419", PYUSD),
  meta("0x0416534873579194f29726f91678c34f7ebc9ea8", USDG),
  meta("0xb14d3fe06f4b000789c420cbc5a6536b5693b20b", USDS),
  // Meta GHO pools, Curve factory pool_list 12-14, coins() verified 2026-11-09.
  meta("0x345fcdcd4f5f125f8acdb3241916025f05079a7a", GHO),
  meta("0xd60cc1154b937b85d70cbf88f913f36d67030540", "0xe10eebaacddf81d1bd92a7c38e7555f94107742d"),
  meta("0x87512e62f635e8c6887ce371f9aec387105ed3bf", "0x4ada21212a165ac805b7bae7bbd80f03be824771"),
];

export const V1_FEEDS = [USDC, USDT, PYUSD, USDG, USDS, GHO];

const CORE_EMITTERS = [
  V1_ORACLE, V1_ADAPTER, V1_ROUTER, V1_FACTORY, V1_ACCESS_MANAGER, V1_CURVE_FACTORY, V1_POOL_DEPLOYER,
];

/** Everything whose logs the indexer stores: reserves, IOU tokens, pools, core contracts. */
export function emittersOf(base: Omit<V1Base, "feeds">): string[] {
  const ious = Object.keys(base.tokens).filter((a) => base.tokens[a].symbol.startsWith("iou"));
  return [...new Set([...base.reserves.map((r) => r.address), ...ious, ...base.pools.map((p) => p.address), ...CORE_EMITTERS])];
}

/** The hand-verified seed. Discovery (worker/src/lib/clear-v1-registry.ts) adds to it at runtime. */
export interface V1Base {
  reserves: V1Reserve[];
  tokens: Record<string, V1Token>;
  pools: V1Pool[];
  feeds: string[];
}

export const V1_STATIC: V1Base = { reserves: V1_RESERVES, tokens: V1_TOKENS, pools: V1_POOLS, feeds: V1_FEEDS };

export const V1_EMITTERS: string[] = emittersOf(V1_STATIC);

/** What discovery found, stored as JSON in cache row "clear-v1-registry". */
export interface Discovered {
  reserves: (V1Reserve & { createdBlock: number })[];
  tokens: Record<string, V1Token>;
  /** notBefore: no event of the pool can sit below this block. */
  pools: (V1Pool & { notBefore: number })[];
  feeds: string[];
  /** Curve factory poll: pools seen so far, head at the last poll, pools whose coins are not all known yet. */
  curve: { count: number; polledAt: number; unmatched: { address: string; coins: [string, string]; notBefore: number }[] } | null;
  /** Past block ranges still to scan for emitters found after the cursor passed them. */
  backfill: { addresses: string[]; from: number; to: number }[];
}

export const emptyDiscovered = (): Discovered => ({ reserves: [], tokens: {}, pools: [], feeds: [], curve: null, backfill: [] });

export interface V1Registry extends V1Base {
  emitters: string[];
}

/** Static entries win on a clash: they were checked by hand. */
export function mergeRegistry(d: Discovered, base: V1Base = V1_STATIC): V1Registry {
  const reserveSet = new Set(base.reserves.map((r) => r.address));
  const poolSet = new Set(base.pools.map((p) => p.address));
  const merged: V1Base = {
    reserves: [
      ...base.reserves,
      ...d.reserves.filter((r) => !reserveSet.has(r.address)).map(({ address, label, kind, legs }) => ({ address, label, kind, legs })),
    ],
    tokens: { ...d.tokens, ...base.tokens },
    pools: [
      ...base.pools,
      ...d.pools.filter((p) => !poolSet.has(p.address)).map(({ address, label, coins }) => ({ address, label, coins })),
    ],
    feeds: [...new Set([...base.feeds, ...d.feeds])],
  };
  return { ...merged, emitters: emittersOf(merged) };
}

export type GasCategory = "oracle" | "rebalance" | "admin" | "other";

export interface GasWallet {
  address: string;
  label: string;
  category: GasCategory;
}

// Paying EOAs. A contract cannot pay gas: add the address that calls it. The gas cron
// counts txs by nonce, which only works for an EOA.
export const V1_GAS_WATCHLIST: GasWallet[] = [
  { address: "0xbc9d0f94ffc516f9b5e87a8480156b8d12332b43", label: "Oracle keeper", category: "oracle" },
  { address: "0x437d207a6bb3b6b656fd8dddab994b0c1a5b6d77", label: "Rebalancer agent", category: "rebalance" },
  { address: "0xea785b9eb31b08bb6cb13ef558eaba2b0014d37a", label: "Guardian", category: "admin" },
];
