"use client";

import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ClearV1Overview } from "@/hooks/use-clear-v1";
import { formatUSD } from "../format";

type Metric = "volume" | "fees" | "rebalances";
type Day = ClearV1Overview["daily"][number];

const METRICS: {
  value: Metric;
  label: string;
  title: string;
  series: string;
  color: string;
  empty: string;
  pick: (d: Day) => number | undefined;
}[] = [
  { value: "volume", label: "Volume", title: "Daily swap volume", series: "Swap volume",
    color: "hsl(263 70% 58%)", empty: "No swaps yet", pick: (d) => d.swapVolume },
  { value: "fees", label: "Fees", title: "Daily fees", series: "Fees",
    color: "hsl(38 92% 60%)", empty: "No fees yet", pick: (d) => d.revenue },
  { value: "rebalances", label: "Rebalances", title: "Daily rebalance volume", series: "Rebalance volume",
    color: "hsl(160 60% 45%)", empty: "No rebalances yet", pick: (d) => d.rebalanceVolume },
];

/** Fees run to cents a day, so small values keep two decimals instead of rounding to whole dollars. */
const money = (v: number) => (v === 0 ? "$0" : v < 10 ? `$${v.toFixed(2)}` : formatUSD(v));

interface Row { date: string; value: number; rebalanceCount?: number }

function ChartTooltip({ active, payload, label, series }: {
  active?: boolean;
  payload?: { payload: Row }[];
  label?: string;
  series: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span>{series}</span>
        <span className="font-medium tabular-nums">{money(row.value)}</span>
      </div>
      {row.rebalanceCount !== undefined && (
        <div className="flex items-center justify-between gap-4">
          <span>Rebalances</span>
          <span className="font-medium tabular-nums">{row.rebalanceCount}</span>
        </div>
      )}
    </div>
  );
}

/** Daily bars for the Clear V1 panel: swap volume, fees (spread revenue) or rebalance volume. */
export function DailyChart({ daily }: { daily: Day[] | undefined }) {
  const [metric, setMetric] = useState<Metric>("volume");
  const m = METRICS.find((x) => x.value === metric)!;

  const loading = !daily;
  // An older Worker does not send the field at all: that is unknown, not zero.
  const unavailable = !!daily && daily.length > 0 && daily.every((d) => m.pick(d) === undefined);
  const rows: Row[] = (daily ?? []).map((d) => ({
    date: d.date,
    value: m.pick(d) ?? 0,
    rebalanceCount: metric === "rebalances" ? d.rebalanceCount : undefined,
  }));
  const empty = rows.every((r) => r.value === 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold">
          {m.title}
          {metric === "fees" && <span className="ml-2 text-xs font-normal text-muted-foreground">Spread only</span>}
        </h3>
        <div className="flex gap-1" role="group" aria-label="Daily chart metric">
          {METRICS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMetric(opt.value)}
              aria-pressed={metric === opt.value}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                metric === opt.value
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="h-32 bg-muted/50 rounded animate-pulse" />
      ) : unavailable ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Data unavailable</div>
      ) : empty ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">{m.empty}</div>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={money} tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false} tickLine={false} width={50} />
            <Tooltip content={<ChartTooltip series={m.series} />} cursor={{ fill: "rgba(161, 161, 170, 0.1)" }} />
            <Bar dataKey="value" fill={m.color} maxBarSize={40} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
