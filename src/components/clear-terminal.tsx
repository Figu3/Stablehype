"use client";

import { useMemo, useState } from "react";
import { ExternalLink, ArrowRight, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useClearV1Activity } from "@/hooks/use-clear-v1";
import {
  toV1Transactions,
  useClearTransactions,
  type ClearTransaction,
  type TxTypeFilter,
} from "@/hooks/use-clear-transactions";
import { ACTOR_TAG_CLASS, ORIGIN_CLASS, shortAddr } from "@/components/clear-protocol/v1/helpers";

// Always offered. Tokens of a discovered reserve are added from the rows themselves.
const TOKEN_OPTIONS = [
  { value: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", label: "USDC" },
  { value: "0xdac17f958d2ee523a2206206994597c13d831ec7", label: "USDT" },
  { value: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f", label: "GHO" },
  { value: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", label: "USDe" },
  { value: "0xdc035d45d973e3ec169d2276ddab16f1e407384f", label: "USDS" },
  { value: "0x6c3ea9036406852006290770bedfcaba0e23a0e8", label: "PYUSD" },
  { value: "0xe343167631d89b6ffc58b88d6b7fb0228795491d", label: "USDG" },
] as const;

// The activity endpoint's maximum page.
const V1_ROWS = 200;
const V02_DAYS = 90;

const TYPE_OPTIONS: { value: TxTypeFilter; label: string }[] = [
  { value: "swap", label: "Swaps" },
  { value: "rebalance", label: "Rebalances" },
  { value: "all", label: "All" },
];
const DEFAULT_TYPE: TxTypeFilter = "swap";

const AT_PAR_NOTE = "V1 amounts are counted at par (1 token = $1); v0.2 amounts are in USD.";

const FILTER_BUTTON = "px-2.5 py-1 text-xs font-medium rounded-md transition-colors border";
const FILTER_IDLE = "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent";
const FILTER_CAPTION = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70";

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatAge(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const EMPTY_CELL = "text-[10px] text-muted-foreground/40";

/** Where a V1 swap came from. An unknown entry shows its address: that is where a new integration shows up. */
function OriginCell({ tx }: { tx: ClearTransaction }) {
  const o = tx.origin;
  if (!o) {
    return (
      <span className={`shrink-0 w-24 ${EMPTY_CELL}`} title="Origin is tracked for V1 swaps only">
        -
      </span>
    );
  }
  const badge = (
    <span className={`inline-block max-w-full truncate text-[10px] font-semibold px-1.5 py-0.5 rounded ${ORIGIN_CLASS[o.kind]}`}>
      {o.kind === "other" ? shortAddr(o.entry) : o.label}
    </span>
  );
  if (o.kind === "integration" || o.kind === "direct") {
    const title = o.kind === "integration"
      ? `Routed by ${o.label}, an integrated aggregator`
      : "The transaction called a Clear contract directly (router or reserve)";
    return <span className="shrink-0 w-24 flex" title={title}>{badge}</span>;
  }
  const title = o.kind === "discovered"
    ? `Not integrated: the transaction entered through ${o.label} (${o.entry})`
    : `Unknown entry contract ${o.entry}`;
  return (
    <a
      href={`https://etherscan.io/address/${o.entry}`}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={`${o.label}, entry contract ${shortAddr(o.entry)}`}
      className="shrink-0 w-24 flex hover:opacity-80"
    >
      {badge}
    </a>
  );
}

/** The known address behind a row. An aggregator tag is left out: it repeats the Origin column. */
function ByCell({ tx }: { tx: ClearTransaction }) {
  const tag = tx.tag;
  if (!tag || tag.kind === "aggregator") {
    return (
      <span className={`hidden sm:block shrink-0 w-36 ${EMPTY_CELL}`} title="No known address behind this transaction">
        -
      </span>
    );
  }
  const address = tx.tagAddress ?? null;
  const badge = (
    <span className={`inline-block max-w-full truncate text-[10px] font-semibold px-1.5 py-0.5 rounded ${ACTOR_TAG_CLASS[tag.kind]}`}>
      {tag.label}
      {/* Many addresses share a bot label: the first bytes tell them apart. */}
      {address && /bot$/i.test(tag.label) && <span className="ml-1 font-mono font-normal opacity-70">{address.slice(0, 6)}</span>}
    </span>
  );
  if (!address) return <span className="hidden sm:flex shrink-0 w-36">{badge}</span>;
  return (
    <a
      href={`https://etherscan.io/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`${tag.label}: ${address}`}
      aria-label={`${tag.label}, ${shortAddr(address)}`}
      className="hidden sm:flex shrink-0 w-36 hover:opacity-80"
    >
      {badge}
    </a>
  );
}

function TxRow({ tx, showOutVsIn }: { tx: ClearTransaction; showOutVsIn: boolean }) {
  const isSwap = tx.type === "swap";
  const outVsInBps = tx.amountInUsd > 0
    ? ((tx.amountOutUsd - tx.amountInUsd) / tx.amountInUsd) * 10_000
    : 0;

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0">
      {/* Type badge */}
      <span className="shrink-0 w-[76px] flex">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            isSwap
              ? "bg-violet-500/15 text-violet-400"
              : "bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {isSwap ? "Swap" : "Rebalance"}
        </span>
      </span>
      <span className={`shrink-0 w-8 text-[10px] font-semibold ${tx.v1 ? "text-blue-400" : "text-muted-foreground/50"}`}>
        {tx.v1 ? "V1" : "v0.2"}
      </span>
      <OriginCell tx={tx} />

      {/* Token in, token out */}
      <div className="flex items-center gap-1.5 min-w-[120px]">
        <span className="text-sm font-medium text-foreground">
          {tx.tokenIn.symbol ?? tx.tokenIn.address.slice(0, 6)}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" aria-label="to" />
        <span className="text-sm font-medium text-foreground">
          {tx.tokenOut.symbol ?? tx.tokenOut.address.slice(0, 6)}
        </span>
      </div>

      <ByCell tx={tx} />

      {/* Amount */}
      <div className="flex-1 text-right">
        <span className="text-sm font-mono text-foreground">
          {formatUSD(tx.amountInUsd)}
        </span>
      </div>

      {/* Amount out against amount in */}
      {showOutVsIn && (
        <div className="shrink-0 w-20 text-right">
          {tx.v1 ? (
            <span className="text-xs text-muted-foreground/60" title="Not available: V1 rows record one amount, at par">
              n/a
            </span>
          ) : (
            <span
              className={`text-xs font-mono ${
                Math.abs(outVsInBps) < 1
                  ? "text-muted-foreground"
                  : outVsInBps < 0
                    ? "text-red-400"
                    : "text-emerald-400"
              }`}
            >
              {`${outVsInBps >= 0 ? "+" : ""}${outVsInBps.toFixed(1)} bps`}
            </span>
          )}
        </div>
      )}

      {/* Time */}
      <div className="w-16 sm:w-24 text-right">
        <span className="text-xs text-muted-foreground" title={formatTime(tx.timestamp)}>
          {formatAge(tx.timestamp)}
        </span>
      </div>

      {/* Etherscan link */}
      <a
        href={`https://etherscan.io/tx/${tx.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title="View transaction on Etherscan"
        aria-label="View transaction on Etherscan"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export function ClearTerminal() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<TxTypeFilter>(DEFAULT_TYPE);
  const [tokenFilter, setTokenFilter] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<string | null>(null);

  const { data: v02Transactions, isLoading, isFetching, isError: v02Failed } = useClearTransactions({
    type: typeFilter,
    token: tokenFilter,
    days: V02_DAYS,
    limit: 500,
  });
  const { data: v1Data, isLoading: v1Loading, isError: v1Failed } = useClearV1Activity("swap,rebalance", { limit: V1_ROWS });

  const v1All = useMemo(() => toV1Transactions(v1Data?.events ?? [], v1Data?.tokens), [v1Data]);
  // A full page means older V1 events exist that this list does not hold.
  const v1Capped = (v1Data?.events.length ?? 0) >= V1_ROWS;

  // Origins present in the data, so a router that starts sending flow gets its own button.
  const originOptions = useMemo(() => {
    const order = { integration: 0, direct: 1, discovered: 2, other: 3 } as const;
    const seen = new Map<string, number>();
    for (const t of v1All) if (t.origin) seen.set(t.origin.label, order[t.origin.kind]);
    return [...seen].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([label]) => label);
  }, [v1All]);

  // The fixed list, then any other token the V1 rows name (a discovered reserve's).
  const tokenOptions = useMemo(() => {
    const seen = new Map<string, string>(TOKEN_OPTIONS.map((o) => [o.value, o.label]));
    for (const t of v1All) {
      for (const token of [t.tokenIn, t.tokenOut]) {
        const address = token.address.toLowerCase();
        if (address && token.symbol && !seen.has(address)) seen.set(address, token.symbol);
      }
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [v1All]);

  const transactions = useMemo(() => {
    const v1 = v1All.filter((t) =>
      (typeFilter === "all" || t.type === typeFilter) &&
      (tokenFilter === null || t.tokenIn.address.toLowerCase() === tokenFilter || t.tokenOut.address.toLowerCase() === tokenFilter) &&
      (originFilter === null || t.origin?.label === originFilter));
    // v0.2 rows carry no origin, so an origin filter leaves them out.
    const v02 = originFilter === null ? (v02Transactions ?? []) : [];
    return [...v1, ...v02].sort((a, b) => b.timestamp - a.timestamp);
  }, [v1All, v02Transactions, typeFilter, tokenFilter, originFilter]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["clear-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["clear-v1-activity"] });
  };

  const clearFilters = () => {
    setTokenFilter(null);
    setOriginFilter(null);
  };

  // Stats over the rows listed below, not over a period.
  const swaps = transactions.filter((t) => t.type === "swap");
  const rebalances = transactions.filter((t) => t.type === "rebalance");
  const swapVolume = swaps.reduce((sum, t) => sum + t.amountInUsd, 0);
  const rebalanceVolume = rebalances.reduce((sum, t) => sum + t.amountInUsd, 0);
  const showOutVsIn = transactions.some((t) => !t.v1);
  const loading = isLoading || v1Loading;
  // One feed down still leaves the other's rows: say which is missing rather than show less in silence.
  const failed = v1Failed && v02Failed ? "Could not load transactions" : v1Failed ? "V1 rows could not be loaded" : v02Failed ? "v0.2 rows could not be loaded" : null;
  const filtered = tokenFilter !== null || originFilter !== null;
  const noun = typeFilter === "swap" ? "swaps" : typeFilter === "rebalance" ? "rebalances" : "transactions";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* Type filter */}
        <div className="flex items-center gap-1.5">
          <span className={FILTER_CAPTION}>Type</span>
          <div className="flex gap-1">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTypeFilter(opt.value)}
                aria-pressed={typeFilter === opt.value}
                className={`${FILTER_BUTTON} ${
                  typeFilter === opt.value ? "bg-violet-500/20 text-violet-400 border-violet-500/30" : FILTER_IDLE
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Token filter */}
        <div className="flex items-center gap-1.5">
          <span className={FILTER_CAPTION}>Token</span>
          <div className="flex flex-wrap gap-1">
            {[{ value: null, label: "All" }, ...tokenOptions].map((opt) => (
              <button
                key={opt.value ?? "all"}
                onClick={() => setTokenFilter(opt.value)}
                aria-pressed={tokenFilter === opt.value}
                className={`${FILTER_BUTTON} ${
                  tokenFilter === opt.value ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : FILTER_IDLE
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Origin filter (V1 swaps) */}
        {originOptions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={FILTER_CAPTION} title="Picking an origin hides rebalances and v0.2 rows: they carry no origin">
              Origin (V1 swaps only)
            </span>
            <div className="flex flex-wrap gap-1">
              {[null, ...originOptions].map((label) => (
                <button
                  key={label ?? "all"}
                  onClick={() => setOriginFilter(label)}
                  aria-pressed={originFilter === label}
                  className={`${FILTER_BUTTON} ${
                    originFilter === label ? "bg-sky-500/20 text-sky-400 border-sky-500/30" : FILTER_IDLE
                  }`}
                >
                  {label ?? "All"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {failed && <span className="text-red-400">{failed}</span>}
        {!loading && typeFilter !== "rebalance" && (
          <span title={AT_PAR_NOTE}>
            {swaps.length} swaps, {formatUSD(swapVolume)} swapped
          </span>
        )}
        {!loading && typeFilter !== "swap" && (
          <span title={AT_PAR_NOTE}>
            {rebalances.length} rebalances, {formatUSD(rebalanceVolume)} rebalanced
          </span>
        )}
        <span className="ml-auto" title="These figures cover the rows listed below, not everything Clear has done">
          {v1Capped
            ? `Rows listed: latest ${V1_ROWS} V1 events, v0.2 over ${V02_DAYS} days`
            : `Rows listed: last ${V02_DAYS} days`}
        </span>
      </div>

      {/* Transaction list */}
      <div className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 py-2 px-3 border-b border-border/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="shrink-0 w-[76px]">Type</span>
          <span className="shrink-0 w-8" title="Clear version: V1 or v0.2">Ver</span>
          <span className="shrink-0 w-24" title="The contract the transaction called. V1 swaps only">Origin</span>
          <span className="min-w-[120px]">In → Out</span>
          <span className="hidden sm:block shrink-0 w-36" title="Known address behind the transaction: bot, team, keeper or relayer">By</span>
          <span className="flex-1 text-right" title={AT_PAR_NOTE}>Amount in</span>
          {showOutVsIn && (
            <span className="shrink-0 w-20 text-right" title="Amount out against amount in, in basis points. v0.2 rows only">
              Out vs in
            </span>
          )}
          <span className="w-16 sm:w-24 text-right">When</span>
          <span className="shrink-0 w-3.5" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="h-8 w-8 rounded-full bg-violet-500/20 animate-pulse" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-48 text-sm text-muted-foreground">
            <span>{failed ?? (filtered ? `No ${noun} match these filters` : `No ${noun} in the last ${V02_DAYS} days`)}</span>
            {filtered && (
              <button onClick={clearFilters} className="text-xs text-foreground underline underline-offset-2 hover:opacity-80">
                Clear token and origin filters
              </button>
            )}
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto">
            {transactions.map((tx) => (
              <TxRow key={`${tx.txHash}-${tx.tokenIn.address}-${tx.tokenOut.address}`} tx={tx} showOutVsIn={showOutVsIn} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
