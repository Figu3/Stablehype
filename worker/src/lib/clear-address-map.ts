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

export type SwapSource = "kyberswap" | "velora" | "cowswap" | "direct" | "other";

/** Map of tx.to address → swap source label */
const SWAP_TO_MAP: Record<string, SwapSource> = {
  // KyberSwap
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5": "kyberswap", // MetaAggregationRouterV2
  "0x958c09b8c862548de60e21eaf4fd0c1d45fd6cae": "kyberswap", // KyberSwap executor
  // Velora (ParaSwap rebrand)
  "0x6a000f20005980200259b80c5102003040001068": "velora", // Augustus v6
  // Direct (Clear Swap contract)
  "0x35e22bcc2c60c8a721cb36ce47ad562860a2d9cb": "direct", // Clear Swap
};

/** CowSwap solver drivers always have addresses starting with 0xc0ffee */
const COWSWAP_FROM_PREFIX = "0xc0ffee";

export function classifySwapSource(txTo: string, txFrom: string): SwapSource {
  // CowSwap check: solver driver address starts with 0xc0ffee
  if (txFrom.toLowerCase().startsWith(COWSWAP_FROM_PREFIX)) return "cowswap";
  // Known router/aggregator check
  return SWAP_TO_MAP[txTo.toLowerCase()] ?? "other";
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
  direct: "Direct",
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
  direct: "hsl(160 60% 45%)",     // emerald
  other: "hsl(240 5% 60%)",       // gray
};

export const REBALANCE_TYPE_COLORS: Record<RebalanceType, string> = {
  internal: "hsl(160 60% 45%)",   // emerald
  external: "hsl(32 95% 55%)",    // orange
};
