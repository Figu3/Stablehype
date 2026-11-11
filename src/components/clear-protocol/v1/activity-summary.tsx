"use client";

import { useState } from "react";
import type { ClearV1Overview, ClearV1Period } from "@/hooks/use-clear-v1";
import { DailyChart, FEE_PARTS, METRICS, periodFeeSplit, type Metric } from "./daily-chart";
import { bps, money } from "./helpers";
import { Segmented } from "./segmented";

const RANGES = [
  { value: 1, label: "1D" },
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
  { value: "all", label: "All" },
] as const;
type Range = (typeof RANGES)[number]["value"];

// Static strings: Tailwind cannot see built ones.
const ACTIVE: Record<Metric, string> = {
  volume: "border-violet-500/60 bg-violet-500/10",
  fees: "border-amber-500/60 bg-amber-500/10",
  avgFee: "border-sky-500/60 bg-sky-500/10",
  rebalances: "border-emerald-500/60 bg-emerald-500/10",
};
const DOT: Record<Metric, string> = {
  volume: "bg-violet-500", fees: "bg-amber-500", avgFee: "bg-sky-500", rebalances: "bg-emerald-500",
};

/** Change against the window before, or null when there is nothing to compare with. */
export function change(current: number | undefined, previous: number | undefined): string | null {
  if (current === undefined || previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const r = Math.round(pct);
  return `${r > 0 ? "+" : ""}${r}%`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The line under a tile's figure: what the figure is made of. */
function sub(metric: Metric, p: ClearV1Period): string {
  if (metric === "volume") return plural(p.swapCount, "swap");
  if (metric === "fees") return "Kept by LPs and treasury";
  if (metric === "rebalances") {
    const count = plural(p.rebalanceCount, "rebalance");
    return p.rebalanceVolume === undefined ? count : `of swap volume, ${money(p.rebalanceVolume)} in ${count}`;
  }
  const split = periodFeeSplit(p);
  if (!split) return "No swaps";
  const total = split.lp + split.treasury + split.trader;
  if (total === 0) return "No fee charged";
  return FEE_PARTS.map((part) => `${part.label} ${Math.round((split[part.key] / total) * 100)}%`).join(", ");
}

/**
 * Swap volume, fees, the average fee and rebalances over 1, 7, 30 or 90 days, or all time. Each figure is
 * also the switch for the chart below it.
 */
export function ActivitySummary({ overview, loading }: { overview: ClearV1Overview | undefined; loading: boolean }) {
  const [range, setRange] = useState<Range>(7);
  const [metric, setMetric] = useState<Metric>("volume");
  const all = range === "all";
  const period = all ? overview?.allTime : overview?.periods.find((p) => p.days === range);
  const span = all ? "All time" : `${range}D`;
  const m = METRICS.find((x) => x.value === metric)!;
  const split = period ? periodFeeSplit(period) : null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Activity</h2>
        <Segmented value={range} onChange={setRange} options={RANGES} label="Period" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" role="group" aria-label="Chart metric">
        {METRICS.map((opt) => {
          const headline = period ? opt.headline(period) : undefined;
          const delta = period ? change(opt.total?.(period), opt.previous?.(period)) : null;
          const on = metric === opt.value;
          return (
            <button key={opt.value} type="button" onClick={() => setMetric(opt.value)} aria-pressed={on}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? ACTIVE[opt.value] : "border-border hover:bg-muted/50"}`}>
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${DOT[opt.value]}`} aria-hidden />
                {span} {opt.label.toLowerCase()}
              </span>
              {loading ? (
                <span className="mt-1 block h-7 w-20 bg-muted/50 rounded animate-pulse" />
              ) : (
                <span className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums">{headline ?? "-"}</span>
                  {delta && (
                    <span className={`text-xs tabular-nums ${delta.startsWith("+") ? "text-emerald-500" : delta.startsWith("-") ? "text-rose-500" : "text-muted-foreground"}`}>
                      {delta} <span className="text-muted-foreground">vs prior {range}d</span>
                    </span>
                  )}
                </span>
              )}
              <span className="block text-xs text-muted-foreground">{period ? sub(opt.value, period) : " "}</span>
            </button>
          );
        })}
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-sm font-medium text-muted-foreground">{m.title}</h3>
          {metric === "avgFee" && split && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {FEE_PARTS.map((part) => (
                <li key={part.key} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: part.color }} aria-hidden />
                  {part.label} <span className="tabular-nums text-foreground">{bps(split[part.key])}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DailyChart daily={overview?.daily} metric={metric} days={all ? Infinity : range} />
      </div>
    </div>
  );
}
