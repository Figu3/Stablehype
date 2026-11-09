"use client";

import { useState } from "react";
import type { ClearV1Overview, ClearV1Quote } from "@/hooks/use-clear-v1";
import { tokenLabel } from "./helpers";
import { quoteStatus, rate, vsMarketBps } from "./route-states";

const fmtAmount = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBps = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} bps`;

/**
 * Stablecoin-to-stablecoin swaps on Clear: pick what you hold, see what you can swap it into and at what
 * rate. Each quote chains the reserves' own previews at a fixed size, so it is what a swap would pay at
 * the last sync (checked to the unit against real trades 0x63af9dcc and 0xddb5fa07).
 */
export function RoutesPanel({ overview }: { overview: ClearV1Overview }) {
  const state = overview.state;
  const quotes = state?.quotes ?? [];
  const name = (a: string) => tokenLabel(a, overview.tokens);
  const sources = [...new Set(quotes.map((q) => q.tokenIn))];
  const tradable = (q: ClearV1Quote) => q.amountOut !== null;
  const firstLive = sources.find((s) => quotes.some((q) => q.tokenIn === s && tradable(q)));
  const [picked, setPicked] = useState<string | null>(null);
  const from = picked ?? firstLive ?? sources[0];

  if (!state || quotes.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2">Swaps</h3>
        <p className="text-sm text-muted-foreground">No quotes yet: they arrive with the next state sync.</p>
      </div>
    );
  }

  const base = state.reserves.find((r) => r.kind === "base");
  const baseAssets = base ? (state.spotRoutes ?? []).filter((r) => r.hops.length === 1).map((r) => r.tokenIn) : [];
  const proximity = state.basket?.proximityBps ?? null;
  const rows = quotes.filter((q) => q.tokenIn === from);
  const live = quotes.filter(tradable).length;
  const size = rows[0]?.amountIn ?? 10_000;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Swaps</h3>
        <span className="text-xs text-muted-foreground">{live} of {quotes.length} pairs quote now</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Swap from">
        <span className="text-xs text-muted-foreground mr-1">From</span>
        {sources.map((s) => {
          const n = quotes.filter((q) => q.tokenIn === s && tradable(q)).length;
          const active = s === from;
          return (
            <button key={s} type="button" role="tab" aria-selected={active} onClick={() => setPicked(s)}
              className={`rounded-full border px-3 py-1 text-sm ${active
                ? "border-foreground bg-foreground text-background font-medium"
                : "border-border hover:bg-muted"}`}>
              {name(s)}
              <span className={`ml-1.5 text-xs ${active ? "opacity-80" : "text-muted-foreground"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">To</th>
              <th className="text-right font-medium px-3 py-2">You get for {fmtAmount(size).replace(".00", "")} {name(from)}</th>
              <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">vs market</th>
              <th className="text-left font-medium px-3 py-2">How</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const s = quoteStatus(q, state.feeds, baseAssets, proximity, name);
              const r = rate(q);
              const m = vsMarketBps(q, state.feeds);
              return (
                <tr key={q.tokenOut} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{name(q.tokenOut)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {q.amountOut === null ? <span className="text-muted-foreground">-</span> : (
                      <>
                        <div className="font-medium">{fmtAmount(q.amountOut)}</div>
                        <div className="text-xs text-muted-foreground">
                          rate {r!.toFixed(5)}<span className="sm:hidden">{m !== null ? `, ${fmtBps(m)}` : ""}</span>
                        </div>
                      </>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums hidden sm:table-cell ${m === null ? "text-muted-foreground"
                    : m >= 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                    {m === null ? "-" : fmtBps(m)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-start gap-1.5 ${s.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${s.ok ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-hidden />
                      {s.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Quotes come from Clear&apos;s own preview functions at the last sync, fees included, and match what a swap
        of that size pays. &quot;vs market&quot; compares the rate with the two tokens&apos; oracle prices. Depeg-route
        swaps also pay the trader a small IOU, not counted here.
      </p>
    </div>
  );
}
