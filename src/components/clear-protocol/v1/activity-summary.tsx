"use client";

import { useState } from "react";
import type { ClearV1Overview } from "@/hooks/use-clear-v1";
import { DailyChart, METRICS, type Metric } from "./daily-chart";
import { money } from "./helpers";
import { Segmented } from "./segmented";

const RANGES = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
] as const;
type Range = (typeof RANGES)[number]["value"];

// Static strings: Tailwind cannot see built ones.
const ACTIVE: Record<Metric, string> = {
  volume: "border-violet-500/60 bg-violet-500/10",
  fees: "border-amber-500/60 bg-amber-500/10",
  rebalances: "border-emerald-500/60 bg-emerald-500/10",
};
const DOT: Record<Metric, string> = { volume: "bg-violet-500", fees: "bg-amber-500", rebalances: "bg-emerald-500" };

/** Change against the window before, or null when there is nothing to compare with. */
export function change(current: number | undefined, previous: number | undefined): string | null {
  if (current === undefined || previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const r = Math.round(pct);
  return `${r > 0 ? "+" : ""}${r}%`;
}

/** Swap volume, fees and rebalances over 7, 30 or 90 days. Each figure is also the switch for the chart below it. */
export function ActivitySummary({ overview, loading }: { overview: ClearV1Overview | undefined; loading: boolean }) {
  const [range, setRange] = useState<Range>(7);
  const [metric, setMetric] = useState<Metric>("volume");
  const period = overview?.periods.find((p) => p.days === range);
  const m = METRICS.find((x) => x.value === metric)!;
  const sub = (v: Metric): string | null =>
    !period ? null
      : v === "volume" ? `${period.swapCount} ${period.swapCount === 1 ? "swap" : "swaps"}`
      : v === "fees" ? "Spread only"
      : `${period.rebalanceCount} ${period.rebalanceCount === 1 ? "rebalance" : "rebalances"}`;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Activity</h2>
        <Segmented value={range} onChange={setRange} options={RANGES} label="Period" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-label="Chart metric">
        {METRICS.map((opt) => {
          const total = period ? opt.total(period) : undefined;
          const delta = period ? change(total, opt.previous(period)) : null;
          const on = metric === opt.value;
          return (
            <button key={opt.value} type="button" onClick={() => setMetric(opt.value)} aria-pressed={on}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? ACTIVE[opt.value] : "border-border hover:bg-muted/50"}`}>
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${DOT[opt.value]}`} aria-hidden />
                {range}D {opt.label.toLowerCase()}
              </span>
              {loading ? (
                <span className="mt-1 block h-7 w-20 bg-muted/50 rounded animate-pulse" />
              ) : (
                <span className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums">{total === undefined ? "-" : money(total)}</span>
                  {delta && (
                    <span className={`text-xs tabular-nums ${delta.startsWith("+") ? "text-emerald-500" : delta.startsWith("-") ? "text-rose-500" : "text-muted-foreground"}`}>
                      {delta} <span className="text-muted-foreground">vs prior {range}d</span>
                    </span>
                  )}
                </span>
              )}
              <span className="block text-xs text-muted-foreground">{sub(opt.value) ?? " "}</span>
            </button>
          );
        })}
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-1">{m.title}</h3>
        <DailyChart daily={overview?.daily} metric={metric} days={range} />
      </div>
    </div>
  );
}
