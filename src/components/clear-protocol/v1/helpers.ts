import { V1_TOKENS, type V1Token } from "@shared/lib/clear-v1-config";
import { formatUSD } from "../format";

export const STALE = "oracle stale";

export const usd = (v: number | null | undefined, fallback = STALE) =>
  v === null || v === undefined ? fallback : v === 0 ? "$0" : formatUSD(v);

export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

/** Tokens as the API serves them: the static seed plus discovered reserves' tokens. */
export type TokenMap = Record<string, V1Token>;

/** Symbol for a known token, else a shortened address. */
export const tokenLabel = (address: string | null, tokens: TokenMap = V1_TOKENS) =>
  address === null ? "-" : (tokens[address.toLowerCase()]?.symbol ?? V1_TOKENS[address.toLowerCase()]?.symbol ?? shortAddr(address));

export const amount = (v: number | null) =>
  v === null ? STALE : v.toLocaleString("en-US", { maximumFractionDigits: 0 });
