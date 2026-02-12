// --- Flag-based classification ---

/** Backing mechanism */
export type BackingType = "rwa-backed" | "crypto-backed" | "algorithmic";

/** Peg currency */
export type PegCurrency = "USD" | "EUR" | "GBP" | "CHF" | "BRL" | "RUB" | "GOLD" | "VAR" | "OTHER";

/** Governance model */
export type GovernanceType = "centralized" | "centralized-dependent" | "decentralized";

export interface StablecoinFlags {
  backing: BackingType;
  pegCurrency: PegCurrency;
  governance: GovernanceType;
  yieldBearing: boolean;
  rwa: boolean; // real-world-asset backed (treasuries, bonds, etc.)
  navToken: boolean; // price appreciates over time as yield accrues (not pegged to $1) — exclude from peg deviation metrics
}

export interface StablecoinMeta {
  id: string; // DefiLlama numeric ID
  name: string;
  symbol: string;
  flags: StablecoinFlags;
  collateral?: string;
  pegMechanism?: string;
  goldOunces?: number; // troy ounces of gold per token (for gold-pegged stablecoins)
}

// --- Filter tags (used in the UI to filter the table) ---

export type FilterTag =
  | "usd-peg"
  | "eur-peg"
  | "gold-peg"
  | "other-peg"
  | "centralized"
  | "centralized-dependent"
  | "decentralized"
  | "rwa-backed"
  | "crypto-backed"
  | "algorithmic"
  | "yield-bearing"
  | "rwa";

export const FILTER_TAG_LABELS: Record<FilterTag, string> = {
  "usd-peg": "USD Peg",
  "eur-peg": "EUR Peg",
  "gold-peg": "Gold Peg",
  "other-peg": "Other Peg",
  centralized: "Centralized",
  "centralized-dependent": "CeFi-Dependent",
  decentralized: "Decentralized",
  "rwa-backed": "RWA-Backed",
  "crypto-backed": "Crypto-Backed",
  algorithmic: "Algorithmic",
  "yield-bearing": "Yield-Bearing",
  rwa: "RWA",
};

function pegCurrencyToFilterTag(peg: PegCurrency): FilterTag {
  switch (peg) {
    case "USD": return "usd-peg";
    case "EUR": return "eur-peg";
    case "GOLD": return "gold-peg";
    default: return "other-peg";
  }
}

export function getFilterTags(meta: StablecoinMeta): FilterTag[] {
  const tags: FilterTag[] = [];
  tags.push(pegCurrencyToFilterTag(meta.flags.pegCurrency));
  tags.push(meta.flags.governance);
  tags.push(meta.flags.backing);
  if (meta.flags.yieldBearing) tags.push("yield-bearing");
  if (meta.flags.rwa) tags.push("rwa");
  return tags;
}

// --- API data types (DefiLlama responses) ---

export interface StablecoinData {
  id: string;
  name: string;
  symbol: string;
  geckoId: string | null;
  pegType: string;
  pegMechanism: string;
  price: number | null;
  priceSource: string;
  circulating: Record<string, number>;
  circulatingPrevDay: Record<string, number>;
  circulatingPrevWeek: Record<string, number>;
  circulatingPrevMonth: Record<string, number>;
  chainCirculating: Record<
    string,
    { current: number; circulatingPrevDay: number; circulatingPrevWeek: number; circulatingPrevMonth: number }
  >;
  chains: string[];
}

export interface StablecoinListResponse {
  peggedAssets: StablecoinData[];
}

export interface ChartDataPoint {
  date: string;
  totalCirculating: Record<string, number>;
  totalCirculatingUSD: Record<string, number>;
}

export interface StablecoinChartResponse {
  [key: string]: ChartDataPoint[];
}

export interface StablecoinHistoryPoint {
  date: string;
  totalCirculating: Record<string, number>;
  totalCirculatingUSD: Record<string, number>;
}

export interface SortConfig {
  key: string;
  direction: "asc" | "desc";
}

// --- Stablecoin Cemetery types ---

export type CauseOfDeath =
  | "algorithmic-failure"
  | "counterparty-failure"
  | "liquidity-drain"
  | "regulatory"
  | "abandoned";

export interface DeadStablecoin {
  name: string;
  symbol: string;
  llamaId?: string;         // DefiLlama stablecoin ID (historical — may have been reassigned)
  logo?: string;            // local path under /logos/cemetery/ (e.g. "ust.png")
  pegCurrency: PegCurrency;
  causeOfDeath: CauseOfDeath;
  deathDate: string;        // "YYYY-MM" format
  peakMcap?: number;        // peak circulating supply in USD (from DefiLlama historical data)
  obituary: string;
  sourceUrl: string;
  sourceLabel: string;
}

// --- Blacklist/Freeze tracker types ---

export type BlacklistStablecoin = "USDC" | "USDT" | "PAXG" | "XAUT";
export type BlacklistEventType = "blacklist" | "unblacklist" | "destroy";

export interface BlacklistEvent {
  id: string;                      // "${chainId}-${txHash}-${logIndex}"
  stablecoin: BlacklistStablecoin;
  chainId: string;
  chainName: string;
  eventType: BlacklistEventType;
  address: string;                 // The affected address
  amount: number | null;           // Only for "destroy" events (USD value)
  txHash: string;
  blockNumber: number;
  timestamp: number;               // Unix seconds
  explorerTxUrl: string;
  explorerAddressUrl: string;
}
