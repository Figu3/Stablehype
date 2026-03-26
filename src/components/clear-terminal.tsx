"use client";

import { useState } from "react";
import { ExternalLink, ArrowRightLeft, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useClearTransactions,
  type ClearTransaction,
  type TxTypeFilter,
} from "@/hooks/use-clear-transactions";

const TOKEN_OPTIONS = [
  { value: null, label: "All Tokens" },
  { value: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", label: "USDC" },
  { value: "0xdac17f958d2ee523a2206206994597c13d831ec7", label: "USDT" },
  { value: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f", label: "GHO" },
  { value: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", label: "USDe" },
  { value: "0xdc035d45d973e3ec169d2276ddab16f1e407384f", label: "USDS" },
] as const;

const TYPE_OPTIONS: { value: TxTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "swap", label: "Swaps" },
  { value: "rebalance", label: "Rebalances" },
];

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

function TxRow({ tx }: { tx: ClearTransaction }) {
  const isSwap = tx.type === "swap";
  const slippage = tx.amountInUsd > 0
    ? ((tx.amountOutUsd - tx.amountInUsd) / tx.amountInUsd) * 100
    : 0;

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0">
      {/* Type badge */}
      <span
        className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
          isSwap
            ? "bg-violet-500/15 text-violet-400"
            : "bg-emerald-500/15 text-emerald-400"
        }`}
      >
        {isSwap ? "SWAP" : "REBAL"}
      </span>

      {/* Token pair */}
      <div className="flex items-center gap-1.5 min-w-[120px]">
        <span className="text-sm font-medium text-foreground">
          {tx.tokenIn.symbol ?? tx.tokenIn.address.slice(0, 6)}
        </span>
        <ArrowRightLeft className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground">
          {tx.tokenOut.symbol ?? tx.tokenOut.address.slice(0, 6)}
        </span>
      </div>

      {/* Amount */}
      <div className="flex-1 text-right">
        <span className="text-sm font-mono text-foreground">
          {formatUSD(tx.amountInUsd)}
        </span>
      </div>

      {/* Slippage */}
      <div className="w-16 text-right">
        <span
          className={`text-xs font-mono ${
            Math.abs(slippage) < 0.1
              ? "text-muted-foreground"
              : slippage < 0
                ? "text-red-400"
                : "text-emerald-400"
          }`}
        >
          {slippage >= 0 ? "+" : ""}{slippage.toFixed(2)}%
        </span>
      </div>

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
        title="View on Etherscan"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export function ClearTerminal() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<TxTypeFilter>("all");
  const [tokenFilter, setTokenFilter] = useState<string | null>(null);

  const { data: transactions, isLoading, isFetching } = useClearTransactions({
    type: typeFilter,
    token: tokenFilter,
    days: 90,
    limit: 500,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["clear-transactions"] });
  };

  // Stats
  const swapCount = transactions?.filter((t) => t.type === "swap").length ?? 0;
  const rebalCount = transactions?.filter((t) => t.type === "rebalance").length ?? 0;
  const totalVolume = transactions?.reduce((sum, t) => sum + t.amountInUsd, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <div className="flex gap-1">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                typeFilter === opt.value
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Token filter */}
        <div className="flex gap-1">
          {TOKEN_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setTokenFilter(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                tokenFilter === opt.value
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

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
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{swapCount} swaps</span>
        <span>{rebalCount} rebalances</span>
        <span>Total: {formatUSD(totalVolume)}</span>
        <span className="ml-auto">Last 90 days</span>
      </div>

      {/* Transaction list */}
      <div className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 py-2 px-3 border-b border-border/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="w-12">Type</span>
          <span className="min-w-[120px]">Pair</span>
          <span className="flex-1 text-right">Amount</span>
          <span className="w-16 text-right">Slip</span>
          <span className="w-16 sm:w-24 text-right">When</span>
          <span className="w-4" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="h-8 w-8 rounded-full bg-violet-500/20 animate-pulse" />
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            No transactions found
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto">
            {transactions.map((tx) => (
              <TxRow key={`${tx.txHash}-${tx.tokenIn.address}-${tx.tokenOut.address}`} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
