/**
 * Canonical swap-source and rebalance-type metadata for Clear Protocol.
 * Single source of truth for types, labels, colors, and display orders —
 * imported by both the worker (classification + API serialization) and the
 * Next.js frontend (charts, tooltips, legends).
 *
 * When adding a new source: append the key to `SwapSource`, then add entries
 * in `SWAP_SOURCE_LABELS`, `SWAP_SOURCE_COLORS`, `SWAP_SOURCE_ORDER`,
 * `SWAP_LEGEND_ORDER`, and the `SWAP_SOURCE_KEYS` array. TypeScript will
 * enforce the rest via `Record<SwapSource, …>` exhaustiveness.
 */

// ── Swap Sources ────────────────────────────────────────────────────────────

export type SwapSource =
  | "kyberswap" | "velora" | "cowswap" | "odos" | "0x" | "lifi"
  | "binance" | "debridge" | "socket" | "synapse"
  | "1inch" | "okx" | "bebop" | "openocean" | "metamask"
  | "uniswap" | "maverick" | "sushiswap" | "defisaver" | "enso" | "beefy"
  | "ipor"
  | "direct" | "mev" | "other";

/** All swap sources. Order here is not semantic — use `*_ORDER` / `*_LEGEND_ORDER` for display. */
export const SWAP_SOURCE_KEYS: readonly SwapSource[] = [
  "kyberswap", "velora", "cowswap", "odos", "0x", "lifi",
  "binance", "debridge", "socket", "synapse",
  "1inch", "okx", "bebop", "openocean", "metamask",
  "uniswap", "maverick", "sushiswap", "defisaver", "enso", "beefy",
  "ipor",
  "direct", "mev", "other",
];

export const SWAP_SOURCE_LABELS: Record<SwapSource, string> = {
  kyberswap: "KyberSwap",
  velora: "Velora",
  cowswap: "CowSwap",
  odos: "Odos",
  "0x": "0x Protocol",
  lifi: "LI.FI",
  binance: "Binance",
  debridge: "deBridge",
  socket: "Socket",
  synapse: "Synapse",
  "1inch": "1inch",
  okx: "OKX",
  bebop: "Bebop",
  openocean: "OpenOcean",
  metamask: "MetaMask",
  uniswap: "Uniswap",
  maverick: "Maverick",
  sushiswap: "SushiSwap",
  defisaver: "DeFi Saver",
  enso: "Enso",
  beefy: "Beefy",
  ipor: "IPOR Fusion",
  direct: "Direct",
  mev: "MEV Bots",
  other: "Other",
};

export const SWAP_SOURCE_COLORS: Record<SwapSource, string> = {
  kyberswap: "hsl(263 70% 58%)",
  velora: "hsl(200 70% 50%)",
  cowswap: "hsl(32 95% 55%)",
  odos: "hsl(170 70% 45%)",
  "0x": "hsl(220 70% 55%)",
  lifi: "hsl(280 65% 55%)",
  binance: "hsl(45 100% 50%)",
  debridge: "hsl(270 60% 55%)",
  socket: "hsl(140 70% 45%)",
  synapse: "hsl(300 70% 55%)",
  "1inch": "hsl(10 80% 55%)",
  okx: "hsl(0 0% 35%)",
  bebop: "hsl(90 65% 50%)",
  openocean: "hsl(195 75% 55%)",
  metamask: "hsl(25 85% 55%)",
  uniswap: "hsl(325 80% 60%)",
  maverick: "hsl(15 75% 55%)",
  sushiswap: "hsl(340 75% 55%)",
  defisaver: "hsl(35 40% 45%)",
  enso: "hsl(185 70% 55%)",
  beefy: "hsl(40 90% 55%)",
  ipor: "hsl(210 55% 45%)",
  direct: "hsl(160 60% 45%)",
  mev: "hsl(350 70% 55%)",
  other: "hsl(240 5% 60%)",
};

/** Stacked-bar render order (bottom-to-top). Residual/small buckets at the bottom. */
export const SWAP_SOURCE_ORDER: readonly SwapSource[] = [
  "other", "mev",
  "ipor", "beefy", "enso", "defisaver", "sushiswap", "maverick",
  "uniswap", "metamask", "openocean", "bebop", "okx", "1inch",
  "synapse", "socket", "debridge", "binance",
  "lifi", "0x", "odos", "cowswap", "velora", "direct", "kyberswap",
];

/** Legend display order — most important first. */
export const SWAP_LEGEND_ORDER: readonly SwapSource[] = [
  "kyberswap", "odos", "0x", "direct", "cowswap", "velora", "lifi",
  "1inch", "binance", "uniswap", "metamask", "sushiswap",
  "synapse", "ipor", "debridge", "socket",
  "bebop", "okx", "openocean", "maverick", "defisaver", "enso", "beefy",
  "mev", "other",
];

// ── Bytecode-based classification ───────────────────────────────────────────

/**
 * Known implementation addresses (lowercase) that MEV/arbitrage EIP-1167
 * minimal proxies delegate to. New proxies spawn from the same factories
 * constantly, so we detect them generically rather than hardcoding each
 * proxy address into SWAP_TO_MAP.
 */
export const MEV_IMPLS: ReadonlySet<string> = new Set([
  "0x26f8fae1387718e514447d601d617db246677710",
]);

/**
 * Classify a contract by its on-chain bytecode. Returns `null` when no
 * pattern matches (caller should fall through to other heuristics / "other").
 *
 * Currently recognises:
 *   - EIP-1167 minimal proxies (45 bytes) pointing at a known MEV impl
 *   - EIP-7702 delegations (24 bytes: 0xef0100 + delegator) — classified
 *     as "direct" since these are EOAs with a smart-account wallet
 *     (MetaMask, Ambire, Trust, etc.) batching swaps through Clear. If a
 *     specific delegator ever shows MEV behavior it can be pinned in the
 *     static SWAP_TO_MAP to override this default.
 *
 * Cheap and deterministic — one eth_getCode per previously-unseen tx.to.
 */
export function classifyByBytecode(bytecode: string): { source: SwapSource; detection: string } | null {
  const code = bytecode.toLowerCase();
  // EIP-1167 minimal proxy: 0x363d3d373d3d3d363d73<impl 20B>5af43d82803e903d91602b57fd5bf3
  // 2 (0x) + 20 (prefix) + 40 (impl) + 30 (suffix) = 92 chars total
  const EIP1167_PREFIX = "0x363d3d373d3d3d363d73";
  const EIP1167_SUFFIX = "5af43d82803e903d91602b57fd5bf3";
  if (code.length === 92 && code.startsWith(EIP1167_PREFIX) && code.endsWith(EIP1167_SUFFIX)) {
    const impl = "0x" + code.slice(EIP1167_PREFIX.length, EIP1167_PREFIX.length + 40);
    if (MEV_IMPLS.has(impl)) return { source: "mev", detection: "eip1167-mev" };
  }
  // EIP-7702 delegation designator: 0xef0100 + 20-byte delegator address.
  // 2 (0x) + 6 (prefix) + 40 (delegator) = 48 chars total.
  const EIP7702_PREFIX = "0xef0100";
  if (code.length === 48 && code.startsWith(EIP7702_PREFIX)) {
    return { source: "direct", detection: "eip7702-delegate" };
  }
  return null;
}

// ── Rebalance Types ─────────────────────────────────────────────────────────

export type RebalanceType = "internal" | "external";

export const REBALANCE_TYPE_KEYS: readonly RebalanceType[] = ["internal", "external"];

export const REBALANCE_TYPE_LABELS: Record<RebalanceType, string> = {
  internal: "Internal",
  external: "External",
};

export const REBALANCE_TYPE_COLORS: Record<RebalanceType, string> = {
  internal: "hsl(160 60% 45%)",
  external: "hsl(32 95% 55%)",
};

/** Stacked-bar render order (bottom-to-top). */
export const REBALANCE_TYPE_ORDER: readonly RebalanceType[] = ["external", "internal"];
