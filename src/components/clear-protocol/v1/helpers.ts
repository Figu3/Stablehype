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

/** Dollars that keep their cents under $10: fees run to cents a day and must not round to "$6". */
export const money = (v: number) => (v === 0 ? "$0" : Math.abs(v) < 10 ? `$${v.toFixed(2)}` : formatUSD(v));

/** "2026-11-04" as "Nov 4". */
export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Seconds since a feed's last push, as of the read that saw it. The keeper pushes just inside
 * the TTL and state is read every 15 minutes, so measuring against the viewer's clock calls a
 * feed stale when it has only been pushed again since the read.
 */
export const feedAge = (f: { lastUpdate: number | null }, readAt: number) =>
  f.lastUpdate === null ? null : Math.max(0, readAt - f.lastUpdate);

export const feedStale = (f: { lastUpdate: number | null; ttl: number | null }, readAt: number) => {
  const age = feedAge(f, readAt);
  return age !== null && f.ttl !== null && age > f.ttl;
};

/** Basis points to two decimals: swap fees sit near 2 bps, so whole numbers would hide the split. */
export const bps = (v: number) => `${v.toFixed(2)} bps`;

/** `part` of `whole` in basis points, or null when there is nothing to divide by. */
export const inBps = (part: number, whole: number) => (whole > 0 ? (part / whole) * 10_000 : null);
