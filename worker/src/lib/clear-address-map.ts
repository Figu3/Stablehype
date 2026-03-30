/**
 * Canonical address → label mapping for Clear Protocol volume source classification.
 * Used by both cron sync (storing tx_from/tx_to) and API layer (grouping by source).
 *
 * Swap sources: classified by tx.to (which contract the user called),
 * except CowSwap which is detected by tx.from prefix.
 *
 * Rebalance types: classified by tx.from (who initiated).
 */

// ── Swap Source Classification ──────────────────────────────────────────────

export type SwapSource = "kyberswap" | "velora" | "cowswap" | "odos" | "0x" | "lifi" | "aggregator" | "direct" | "mev" | "other";

/** Map of tx.to address → swap source label */
const SWAP_TO_MAP: Record<string, SwapSource> = {
  // KyberSwap
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5": "kyberswap", // MetaAggregationRouterV2
  "0x958c09b8c862548de60e21eaf4fd0c1d45fd6cae": "kyberswap", // KyberSwap executor

  // Velora (ParaSwap rebrand)
  "0x6a000f20005980200259b80c5102003040001068": "velora", // Augustus v6
  "0xdef171fe48cf0115b1d80b88dc8eab59176fee57": "velora", // Paraswap v5

  // LI.FI
  "0x89c6340b1a1f4b25d36cd8b063d49045caf3f818": "lifi", // LI.FI Permit2 Proxy 2
  "0xcec212eeaa691850ef307782915d336120b01faf": "lifi", // LI.FI v1
  "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae": "lifi", // LI.FI v2

  // Odos
  "0x365084b05fa7d5028346bd21d842ed0601bab5b8": "odos",       // Odos v2
  "0xcf5540fffcdc3d510b18bfca6d2b9987b0772559": "odos",       // Odos v1
  "0xe08d97e151473a848c3d9ca3f323cb720472d015": "odos",       // Odos v2 Router (6818b contract)

  // 0x Protocol
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x",         // 0x Exchange Proxy
  "0xe66b31678d6c16e9ebf358268a790b763c133750": "0x",         // 0x Settler
  "0x0000000000001ff3684f28c67538d4d072c22734": "0x",         // 0x Allowance Holder

  // Other aggregators (grouped as "aggregator")
  "0x111111125421ca6dc452d289314280a0f8842a65": "aggregator", // 1inch v6
  "0x1111111254eeb25477b68fb85ed929f73a960582": "aggregator", // 1inch v5
  "0x11111112542d85b3ef69ae05771c2dccff4faa26": "aggregator", // 1inch v4
  "0x00c600b30fb0400701010f4b080409018b9006e0": "aggregator", // OKX DEX
  "0x80eba3855878739f4710233a8a19d89bdd2ffb8e": "aggregator", // Bebop
  "0x6352a56caadc4f1e25cd6c75970fa768a3304e64": "aggregator", // OpenOcean
  "0x881d40237659c251811cec9c364ef91dc08d300c": "aggregator", // Metamask Swap
  "0x74de5d4fcbf63e00296fd95d33236b9794016631": "aggregator", // Metamask Router
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "aggregator", // Uniswap Universal
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "aggregator", // Uniswap SwapRouter02
  "0xe592427a0aece92de3edee1f18e0157c05861564": "aggregator", // Uniswap SwapRouter
  "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": "aggregator", // Uniswap Universal (old)
  "0x7251febeabb01ec9de53ece7a96f1c951f886dd2": "aggregator", // Maverick V2
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": "aggregator", // SushiSwap
  "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": "aggregator", // SushiSwap v2
  "0x8278da54b4a47c0f6f4a0a4b00b6f31678f30181": "aggregator", // DeFiSaver
  "0xc6efe8a67a31e5e1d5a25eedaa7bafcc7e2371b1": "aggregator", // DeFiSaver Recipes
  "0x287778f121f134c66212fb16c9b53ec991d32f5b": "aggregator", // DeFiSaver Exchange
  "0x63242a4ea82847b20e506b63b0e2e2eff0cc6cb0": "aggregator", // Enso
  "0x5cc9400ffb4da168cf271e912f589462c3a00d1f": "aggregator", // Beefy Zap Router

  // Direct (Clear Swap contract + known user multisigs)
  "0x35e22bcc2c60c8a721cb36ce47ad562860a2d9cb": "direct", // Clear Swap
  "0x9ad88d86c78b5f24ff64e03823ad3e3992b7619d": "direct", // User multisig (Safe)

  // MEV bots (EIP-1167 proxies → 0x26f8fae1... implementation)
  "0x602918c8421e9c1beff8131f80dc3ec818000c76": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x0e18f4a671f241a557e6f760be8c7b97abcb6950": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xecbff987f4c89539570d0c0e6f5809a63ebf3a6e": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xca0240d9ff5180cb2f25499a707033ec25b3ea8e": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x6de6087aa0f1be23e93caf5a5ad89098fff356f5": "mev",  // EIP-1167 proxy → 0x26f8fae1... (routes via KyberSwap)
  "0xe9da86864952e4fbcbd3c3a76174791b26df1f3a": "mev",  // EIP-1167 proxy MEV bot
  "0xae2fc483527b8ef99eb5d9b44875f005ba1fae13": "mev",  // jaredfromsubway.eth
  "0x56178a0d5f301baf6cf3e1cd53d9863437345bf9": "mev",  // MEV Bot
  "0x00000000003b3cc22af3ae1eac0440bcee416b40": "mev",  // Flashbots
  "0x98c3d3183c4b8a650614ad179a1a98be0a8d6b8e": "mev",  // Sandwich
  "0x6b75d8af000000e20b7a7ddf000ba900b4009a80": "mev",  // Searcher
  "0x280027dd00ee0050d3f9d168efd6b40090009246": "mev",  // MEV Bot
  "0x3b17056cc4439c61cea41fe002a5f5cf7b6f5cce": "mev",  // Arbitrage
  "0xd050e0a4838d74769228b49dff97241b4ef3805d": "mev",  // Flashloan
  "0x74a0121dc0ab16d697b79b59cedeffc626d5e28f": "mev",  // DeFiSaver Bot
};

/**
 * CowSwap solver drivers have addresses starting with 0xc0ffee.
 * However, CoffeeBabe MEV bots also start with 0xc0ffee — we exclude known MEV addresses.
 */
const COWSWAP_FROM_PREFIX = "0xc0ffee";
const COWSWAP_FALSE_POSITIVES: Set<string> = new Set([
  "0xc0ffeebabe5d496b2dde509f9fa189c25cf29671", // Bot using Odos (not a CowSwap solver)
]);

/** Heuristic: addresses with many leading zeros are likely MEV bots */
function looksLikeMevBot(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower.startsWith("0x00000000")) return true;
  return false;
}

export function classifySwapSource(txTo: string, txFrom: string): SwapSource {
  // CowSwap check: solver driver address starts with 0xc0ffee (exclude known MEV bots)
  const fromLower = txFrom.toLowerCase();
  if (fromLower.startsWith(COWSWAP_FROM_PREFIX) && !COWSWAP_FALSE_POSITIVES.has(fromLower)) return "cowswap";
  // Known router/aggregator check
  const known = SWAP_TO_MAP[txTo.toLowerCase()];
  if (known) return known;
  // Heuristic MEV bot detection for unlisted addresses
  if (looksLikeMevBot(txTo)) return "mev";
  return "other";
}

// ── Rebalance Type Classification ───────────────────────────────────────────

export type RebalanceType = "internal" | "external";

/** Addresses that trigger external rebalances */
const EXTERNAL_REBALANCE_FROM: Set<string> = new Set([
  "0x9ad88d86c78b5f24ff64e03823ad3e3992b7619d", // Clear team Safe
  "0xfd86faef607a67ed68f7c29042e022196f21de10", // External rebalance Agent
]);

export function classifyRebalanceType(txFrom: string): RebalanceType {
  return EXTERNAL_REBALANCE_FROM.has(txFrom.toLowerCase()) ? "external" : "internal";
}

// ── Display labels ──────────────────────────────────────────────────────────

export const SWAP_SOURCE_LABELS: Record<SwapSource, string> = {
  kyberswap: "KyberSwap",
  velora: "Velora",
  cowswap: "CowSwap",
  odos: "Odos",
  "0x": "0x Protocol",
  lifi: "LI.FI",
  aggregator: "Aggregators",
  direct: "Direct",
  mev: "MEV Bots",
  other: "Other",
};

export const REBALANCE_TYPE_LABELS: Record<RebalanceType, string> = {
  internal: "Internal",
  external: "External",
};

/** Colors for chart segments (HSL strings matching existing chart palette) */
export const SWAP_SOURCE_COLORS: Record<SwapSource, string> = {
  kyberswap: "hsl(263 70% 58%)",  // violet (primary)
  velora: "hsl(200 70% 50%)",     // blue
  cowswap: "hsl(32 95% 55%)",     // orange
  odos: "hsl(170 70% 45%)",       // teal
  "0x": "hsl(220 70% 55%)",       // blue
  lifi: "hsl(280 65% 55%)",       // purple
  aggregator: "hsl(50 90% 50%)",  // amber
  direct: "hsl(160 60% 45%)",     // emerald
  mev: "hsl(350 70% 55%)",        // red
  other: "hsl(240 5% 60%)",       // gray
};

export const REBALANCE_TYPE_COLORS: Record<RebalanceType, string> = {
  internal: "hsl(160 60% 45%)",   // emerald
  external: "hsl(32 95% 55%)",    // orange
};
