"use client";

import { useMemo } from "react";
import type { VaultTokenComposition } from "@/hooks/use-vault-composition";

// ── Per-token colors (full static strings for Tailwind purge) ────────────────

const TOKEN_COLORS: Record<string, { dot: string; bar: string }> = {
  USDC: { dot: "bg-blue-500",    bar: "bg-blue-500" },
  USDT: { dot: "bg-emerald-500", bar: "bg-emerald-500" },
  GHO:  { dot: "bg-violet-500",  bar: "bg-violet-500" },
  USDe: { dot: "bg-orange-400",  bar: "bg-orange-400" },
  USDS: { dot: "bg-pink-500",    bar: "bg-pink-500" },
};

const DEFAULT_COLOR = { dot: "bg-gray-400", bar: "bg-gray-400" };

// ── Component ────────────────────────────────────────────────────────────────

export interface RegimeSuggestion {
  /** Suggested allocation as a fraction (0–1), from regime outflow share + floors. */
  pct: number;
  /** One-line rationale for the suggestion (floor reason or outflow share). */
  rationale: string;
}

export function PoolComposition({
  tokens,
  totalAssets,
  suggestedBySymbol,
}: {
  tokens: VaultTokenComposition[];
  totalAssets: number;
  suggestedBySymbol?: Map<string, RegimeSuggestion>;
}) {
  const sorted = useMemo(
    () => [...tokens].sort((a, b) => b.exposureBps - a.exposureBps),
    [tokens],
  );

  const hasSuggestions = !!suggestedBySymbol && suggestedBySymbol.size > 0;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      {/* Stacked horizontal bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/50">
        {sorted.map((token) => {
          const pct = token.exposureBps / 100;
          const colors = TOKEN_COLORS[token.symbol] ?? DEFAULT_COLOR;
          return (
            <div
              key={token.symbol}
              className={`${colors.bar} transition-all duration-500 first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${pct}%` }}
              title={`${token.symbol}: ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* Column headers (only when regime data is present) */}
      {hasSuggestions && (
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground/70 pb-0.5 border-b border-border/20">
          <span className="invisible">Token</span>
          <div className="flex items-center gap-3 font-mono">
            <span className="text-right">current</span>
            <span className="w-16 text-right">on-chain</span>
            <span className="w-20 text-right" title="7d regime-suggested allocation">
              suggested
            </span>
            <span className="w-20 text-right">balance</span>
          </div>
        </div>
      )}

      {/* Token rows */}
      <div className="space-y-1.5">
        {sorted.map((token) => {
          const pct = token.exposureBps / 100;
          const target = token.desiredBps / 100;
          const delta = pct - target;
          const colors = TOKEN_COLORS[token.symbol] ?? DEFAULT_COLOR;
          const isOverweight = delta > 0.5;
          const isUnderweight = delta < -0.5;
          const sug = suggestedBySymbol?.get(token.symbol);
          const sugPct = sug ? sug.pct * 100 : null;
          const sugDrift = sugPct !== null ? pct - sugPct : null;
          const sugColor =
            sugDrift === null
              ? "text-muted-foreground"
              : Math.abs(sugDrift) < 5
                ? "text-emerald-400"
                : sugDrift > 0
                  ? "text-amber-500"
                  : "text-blue-400";
          return (
            <div key={token.symbol} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${colors.dot}`} />
                <span className="font-medium">{token.symbol}</span>
                <span className="text-[10px] text-muted-foreground">({token.decimals}d)</span>
              </div>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="font-semibold text-emerald-500 dark:text-emerald-400">
                  {pct.toFixed(1)}%
                </span>
                <span className={`text-[10px] w-16 text-right ${
                  isOverweight ? "text-amber-500" : isUnderweight ? "text-blue-400" : "text-muted-foreground"
                }`}>
                  {target > 0 ? `(${target.toFixed(0)}%)` : "(—)"}
                </span>
                {hasSuggestions ? (
                  <span
                    className={`text-[10px] w-20 text-right ${sugColor}`}
                    title={sug ? `${sug.rationale}${sugDrift !== null ? ` · drift ${sugDrift >= 0 ? "+" : ""}${sugDrift.toFixed(1)}pp` : ""}` : undefined}
                  >
                    {sugPct !== null
                      ? `${sugPct.toFixed(0)}%${sugDrift !== null ? ` ${sugDrift >= 0 ? "+" : ""}${sugDrift.toFixed(1)}pp` : ""}`
                      : "—"}
                  </span>
                ) : null}
                <span className="text-muted-foreground w-20 text-right">
                  {token.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {hasSuggestions && (
        <div className="text-[9px] text-muted-foreground pt-1 border-t border-border/20">
          suggested = 7d outflow share · USDS/GHO floors for keeper reserve & two-hop
        </div>
      )}
    </div>
  );
}
