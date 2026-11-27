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
/** ClearAlphaFeeRouter: wraps the router for aggregator fills and takes the aggregator's fee out of the output. */
export const V1_ALPHA_FEE_ROUTER = "0x890a1fdab0559cc0678b9d3b0becb8584d224ba7";
/**
 * KyberSwap's executor: the caller of every AlphaFeeCharged on a swap that entered through the
 * Kyber router (25 of 25 in the week of 2026-11-16). An app that embeds Kyber (DeFi Saver, Fluid,
 * Mayan, a Safe) calls its own contract, so tx_to does not show Kyber but this caller does.
 * The flash arb bots call the alpha fee router themselves, so the caller is what tells them apart.
 */
export const V1_KYBER_EXECUTOR = "0x8f10b468b06c6fd214b65f87778827f7d113f996";

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
  V1_ALPHA_FEE_ROUTER,
];

/**
 * Static emitters added after the events cursor had passed their first log. The events cron
 * queues one backfill job for each, from `from`, and records it in `Discovered.lateDone`.
 */
export const V1_LATE_EMITTERS = [
  { address: V1_ALPHA_FEE_ROUTER, from: 26_328_947 }, // its constructor logs
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
  /** Late static emitters whose backfill job was already queued. Absent on an older row. */
  lateDone?: string[];
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

/**
 * Live integrations, keyed by the contract the user's tx calls (tx_to). Add one when Figue
 * confirms a new integration. KyberSwap MetaAggregationRouterV2: first routed swap 0x20893b98.
 */
export const V1_INTEGRATIONS: Record<string, string> = {
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5": "KyberSwap",
};

/**
 * Routers and settlement contracts Clear is not integrated with, so a swap entering through one
 * names itself instead of showing as "Other". Contract names checked on Blockscout 2026-11-11.
 */
export const V1_KNOWN_ROUTERS: Record<string, string> = {
  "0x111111125421ca6dc452d289314280a0f8842a65": "1inch", // AggregationRouterV6
  "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch", // AggregationRouterV5
  "0x9008d19f58aabd9ed0d60971565aa8510560ab41": "CoW", // GPv2Settlement
  "0x6a000f20005980200259b80c5102003040001068": "Velora", // AugustusV6
  "0xcf5540fffcdc3d510b18bfca6d2b9987b0772559": "Odos", // OdosRouterV2
  "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae": "LI.FI", // LiFiDiamond
  "0x66a9893cc07d91d95644aedd05d03f95e1dba8af": "Uniswap", // UniversalRouter (v4)
  "0xbbbbbbb520d69a9775e85b458c58c648259fad5f": "Bebop", // BebopSettlement
  "0x0000000000001ff3684f28c67538d4d072c22734": "0x", // AllowanceHolder, checked on Blockscout 2026-11-17
  "0x4337084d9e255ff0702461cf8895ce9e3b5ff108": "ERC-4337", // EntryPoint, checked on Blockscout 2026-11-17
  "0x0000000071727de22e5e9d8baf0edac6f37da032": "ERC-4337", // EntryPoint v0.7, checked on Blockscout 2026-11-27
  // Apps seen in front of Kyber in the week of 2026-11-16, named on Blockscout 2026-11-22.
  "0x881d40237659c251811cec9c364ef91dc08d300c": "MetaMask", // MetaSwap
  "0x5567954cd026cebfe486062cb75848e0f1c12e58": "Relay", // RelayApprovalProxy
  "0x3e07be15370d8b12d80a159a7ef14b9e51869497": "Mayan", // FulfillHelper, pays out through SwiftDest
  "0x3727c31d4d4c5270290ffb20c4c358c84c0792c9": "DeFi Saver", // StrategyExecutor, flash loans through FLAction
  "0x324c5dc1fc42c7a4d43d92df1eba58a54d13bf2d": "Fluid", // Fluid Vault, flash loans through InstaFluidFlashAggregator
  "0x781388759eacb9892f60d77d9a99c9be2f7f4ada": "Safe relay", // SafeRelayExecutor: a relayed Safe tx (0xddb5fa07)
};

/**
 * integration: an aggregator Clear is integrated with. bot: an arb bot's own contract or a
 * delegated EOA calling itself. team: Sève or the team. discovered: a router or app we can name.
 * other: none of these, so its entry contract is shown to be looked up.
 */
export type OriginKind = "integration" | "bot" | "team" | "direct" | "discovered" | "other";

export interface SwapOrigin {
  label: string;
  kind: OriginKind;
  /** The contract the tx called, for "Other" rows: that is where a new integration shows up. */
  entry: string;
  /** For an integration reached through another app: that app's name, when we know it. */
  via?: string | null;
}

const V1_CLEAR_ENTRIES = new Set([V1_ROUTER, ...V1_RESERVES.map((r) => r.address)]);

export interface OriginInput {
  tx_to: string | null;
  tx_from?: string | null;
  contract: string;
  /** True when the tx holds an AlphaFeeCharged called by Kyber's executor. */
  via_kyber?: boolean | number | null;
}

/**
 * Where a swap came from. In order: the team's own Safes and keepers; KyberSwap, by its router
 * or by its executor's fee in the same tx (an app that embeds Kyber is its own tx_to); an arb
 * bot, by a known bot address or a sender that called itself; Direct = a Clear contract (the
 * router, a reserve, or the event's own emitter); a router or app we can name; else Other.
 * Null when tx_to is unknown.
 */
export function v1SwapOrigin(e: OriginInput): SwapOrigin | null {
  if (!e.tx_to) return null;
  const to = e.tx_to.toLowerCase();
  const from = e.tx_from?.toLowerCase() ?? null;
  const actorOf = (a: string | null) => (a ? V1_KNOWN_ACTORS[a] : undefined);
  const team = [actorOf(from), actorOf(to)].find((t) => t?.kind === "team" || t?.kind === "keeper");
  if (team) return { label: team.label, kind: "team", entry: to };
  if (V1_INTEGRATIONS[to]) return { label: V1_INTEGRATIONS[to], kind: "integration", entry: to };
  if (e.via_kyber) return { label: "KyberSwap", kind: "integration", entry: to, via: V1_KNOWN_ROUTERS[to] ?? null };
  if (from === to || actorOf(to)?.kind === "mev" || actorOf(from)?.kind === "mev") {
    return { label: "Arb bot", kind: "bot", entry: to };
  }
  if (V1_CLEAR_ENTRIES.has(to) || to === e.contract.toLowerCase()) return { label: "Direct", kind: "direct", entry: to };
  if (V1_KNOWN_ROUTERS[to]) return { label: V1_KNOWN_ROUTERS[to], kind: "discovered", entry: to };
  return { label: "Other", kind: "other", entry: to };
}

/** Swap categories for the split chart, in display order. Named routers fold into one. */
export const V1_ORIGIN_CATEGORIES: { kind: OriginKind; label: string }[] = [
  { kind: "bot", label: "Arb bots" },
  { kind: "integration", label: "KyberSwap" },
  { kind: "discovered", label: "Other routers" },
  { kind: "direct", label: "Direct" },
  { kind: "team", label: "Team" },
  { kind: "other", label: "Unlabeled" },
];

export type ActorKind = "mev" | "team" | "keeper" | "aggregator" | "relayer";

export interface ActorTag {
  label: string;
  kind: ActorKind;
}

// Known swappers and rebalancers, lowercase. Hand-verified from their on-chain history.
// The flash arb bots are EIP-7702 burner EOAs (delegate 0x07241d6a…0da0) that flash-borrow
// on Balancer, swap on Clear and close on Uniswap v4: the operator rotates them, so new
// ones will show untagged until added here.
/** Sève's Safes: the Wildcat borrower, which holds the reserve shares, and the rebalance agent. */
export const SEVE_SAFES = [
  { label: "Borrower Safe", address: "0x16d9ba632757914c3a1ba9291f23fa075f24c3bc" },
  { label: "Rebalancer Safe", address: "0x7552b3764b5e34a4d15565836885daa50c35ab85" },
] as const;

/** The Wildcat loan is in USDT0, so Sève counts in USDT. */
export const SEVE_UNIT_TOKEN = USDT;
/** Stablehype id of each stablecoin Sève holds, to price it in USDT. */
export const SEVE_PRICE_IDS: Record<string, string> = {
  [USDT]: "1", [USDC]: "2", [PYUSD]: "120", [USDG]: "286", [USDS]: "209", [GHO]: "118",
};

/** Stablecoins Sève mints and burns with their issuer, Paxos. Receiving one is a mint, sending one a burn. */
export const SEVE_ISSUER_TOKENS: readonly string[] = [USDG, PYUSD];

export const V1_KNOWN_ACTORS: Record<string, ActorTag> = {
  "0xc0ffeebabe5d496b2dde509f9fa189c25cf29671": { label: "c0ffeebabe.eth", kind: "mev" },
  "0xe08d97e151473a848c3d9ca3f323cb720472d015": { label: "c0ffeebabe.eth", kind: "mev" },
  "0xa4719f7dd3bd2ab980c7938d90c6b29e12361d96": { label: "Flash arb bot", kind: "mev" },
  "0x7169ad45b2f0300f5fd49fa0d6c1d791f3d8fd5c": { label: "Flash arb bot", kind: "mev" },
  "0x71cd5898497277994a48637ee784deaf07874b58": { label: "Flash arb bot", kind: "mev" },
  // Same family, 17 Nov 2026: each one carries the 0xef0100 + 07241d6a… designator.
  "0xb3c9fa93291b9d68d79a3fe7171237a86b7856e6": { label: "Flash arb bot", kind: "mev" },
  "0x9dffb0752c6683ddd06c722f6bcc5dadb08a1b77": { label: "Flash arb bot", kind: "mev" },
  "0xee84362ed53e5e2d58d99e6da20ccb15560b6194": { label: "Flash arb bot", kind: "mev" },
  "0xc166f3804357295021a07a5e8d442c9d3e7db5a4": { label: "Flash arb bot", kind: "mev" },
  "0xa7dc094f1d036c2dd568a57782417f408c07d6b2": { label: "Flash arb bot", kind: "mev" },
  "0xa828fc9718122a2ead8857ae58ec958b4d2df59c": { label: "Flash arb bot", kind: "mev" },
  "0xf71bdfc84d855f3e885ec31611afd778f90b9048": { label: "Flash arb bot", kind: "mev" },
  "0x908f07de62fa5f2b4babade87284e398317ae075": { label: "Flash arb bot", kind: "mev" },
  "0xde9e78ca837138745433db68ebf3f23d4e721718": { label: "Flash arb bot", kind: "mev" },
  "0x57bba97cc06639a9de07d69723a8ce82ad73f6a1": { label: "Flash arb bot", kind: "mev" },
  "0x03a44d36916b4e3bb1902e29a1592f79ca0cea82": { label: "Flash arb bot", kind: "mev" },
  "0xa3b3ff21360f3c0c65fbd5f2be548e5e309e3fc7": { label: "Flash arb bot", kind: "mev" },
  "0xf8c4ac5424241d8aa001c97c6944b0daee8aaa41": { label: "Flash arb bot", kind: "mev" },
  "0x728b812677adb09eb1d866f8d3b62de10438617c": { label: "Flash arb bot", kind: "mev" },
  "0xb60931f64b8cead9085ea1f9871da482b531193e": { label: "Flash arb bot", kind: "mev" },
  // Two other self-calling 7702 EOAs with their own unverified delegates (0xbad39476…, 0xcbf2c6e0…)
  // and over 20,000 txs each: arb bots closing Clear against other pools, operators unknown.
  "0x681878dc5abaa70d182b3e1c4d6a3fd1e16922c0": { label: "Arb bot", kind: "mev" },
  "0x225f99aaaa914d0481ef3a0bedd8aabf1b9c4d1d": { label: "Arb bot", kind: "mev" },
  // Unverified bot contracts, week of 2026-11-16: a Morpho flash loan, Clear against Uniswap v4
  // or Curve in the same tx, nothing left in tokens and 0 priority fee (the profit is paid to the
  // builder). Matched on tx_to. Operators unknown.
  "0x0000000000be226afde21672a5e4adc45692e69d": { label: "Arb bot", kind: "mev" },
  "0x00000f91109c4d0007e90000d9facad5298a0cac": { label: "Arb bot", kind: "mev" },
  "0x202d241dcaf52494fd3cc0b2cc4971532e454de7": { label: "Arb bot", kind: "mev" },
  "0x2819bac791627e5c5ae5048017145b226f51941d": { label: "Arb bot", kind: "mev" },
  // Routes through Kyber and 1inch in one tx and keeps the USDT gained (tx 0x4acd9334).
  "0x9be985f666f9edbb869d09e1856bb60f6d0c8ddd": { label: "Arb bot", kind: "mev" },
  // Unverified contract from the CREATE2 deployer, live since 2026-11-23, called by EOAs 0x747f1f72…
  // and 0x2ac6495c…: a Uniswap v4 flash, USDT to USDC on Clear, an eUSD leg, and the gain swapped to
  // WETH for the builder (tx 0x91af0c57). Matched on tx_to. Operator unknown.
  "0x1b18a10f8c6cd63f53f26c4d0f7a24c4b0df5e0a": { label: "Arb bot", kind: "mev" },
  // Same operator (EOA 0x747f1f72…), live since 2026-11-27: a Uniswap v4 flash of USDT, USDT to USDC
  // on Clear, USDC to DAI to USDS through Sky's PSM and converter, closed on v4 with 0 priority fee
  // (tx 0xa64e6717). Matched on tx_to.
  "0x000000e4d8f91ff5fa648f989416188de3099020": { label: "Arb bot", kind: "mev" },
  // Integrated aggregators, matched on tx_to: the swapper is the user's EOA, the actor is the Clear router.
  ...Object.fromEntries(Object.entries(V1_INTEGRATIONS).map(([a, label]) => [a, { label, kind: "aggregator" as const }])),
  // Pimlico bundler EOA (identified by Figue, 2026-11-17): it pays the gas of an ERC-4337 user
  // operation through the EntryPoint, the swapper is the smart account behind it. Matched on tx_from.
  "0x4337edb05773d3927c63f9a2734c15d03c5062bc": { label: "Pimlico", kind: "relayer" },
  "0x16d9ba632757914c3a1ba9291f23fa075f24c3bc": { label: "Sève", kind: "team" },
  "0x7552b3764b5e34a4d15565836885daa50c35ab85": { label: "Sève", kind: "team" },
  "0x009d13e9bec94bf16791098ce4e5c168d27a9f07": { label: "Team", kind: "team" },
  "0x437d207a6bb3b6b656fd8dddab994b0c1a5b6d77": { label: "Rebalancer agent", kind: "keeper" },
};

/** Tag of the first known address, so pass the most specific one first (actor, tx sender, then tx target). */
export const v1ActorTag = (...addresses: (string | null | undefined)[]): ActorTag | null => {
  for (const a of addresses) {
    const tag = a ? V1_KNOWN_ACTORS[a.toLowerCase()] : undefined;
    if (tag) return tag;
  }
  return null;
};

const LIKELY_BOT: ActorTag = { label: "Likely bot", kind: "mev" };

/**
 * Tag of one event: a known address first, else "Likely bot" when the sender called itself.
 * An EOA can only run a swap by calling itself if it is EIP-7702 delegated, which is how the
 * arb bots work, each on a fresh burner. A person batching from a 7702 smart wallet looks the
 * same: add their address to V1_KNOWN_ACTORS to name them.
 */
export const v1EventTag = (
  actor: string | null | undefined,
  txFrom: string | null | undefined,
  txTo: string | null | undefined,
): ActorTag | null => {
  const known = v1ActorTag(actor, txFrom, txTo);
  if (known) return known;
  return txFrom && txTo && txFrom.toLowerCase() === txTo.toLowerCase() ? LIKELY_BOT : null;
};

export type GasCategory ="oracle" | "rebalance" | "admin" | "other";

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
