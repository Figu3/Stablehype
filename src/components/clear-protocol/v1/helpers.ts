import { V1_TOKENS, type ActorKind, type V1Token } from "@shared/lib/clear-v1-config";
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

/** Badge colours for a known actor's tag. Static strings: Tailwind cannot see built ones. */
export const ACTOR_TAG_CLASS: Record<ActorKind, string> = {
  mev: "bg-red-500/15 text-red-400",
  team: "bg-violet-500/15 text-violet-400",
  keeper: "bg-emerald-500/15 text-emerald-400",
};

export const amount =(v: number | null) =>
  v === null ? STALE : v.toLocaleString("en-US", { maximumFractionDigits: 0 });
