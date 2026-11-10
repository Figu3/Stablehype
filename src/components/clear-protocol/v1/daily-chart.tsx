"use client";

import { Bar, BarChart, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ClearV1Overview, ClearV1Period } from "@/hooks/use-clear-v1";
import { money, shortDate } from "./helpers";

export type Metric = "volume" | "fees" | "rebalances";
type Day = ClearV1Overview["daily"][number];

export const METRICS: {
  value: Metric;
  label: string;
  title: string;
  series: string;
  color: string;
  empty: string;
  pick: (d: Day) => number | undefined;
  total: (p: ClearV1Period) => number | undefined;
  previous: (p: ClearV1Period) => number | undefined;
}[] = [
  { value: "volume", label: "Volume", title: "Daily swap volume", series: "Swap volume",
    color: "hsl(263 70% 62%)", empty: "No swaps in this period",
    pick: (d) => d.swapVolume, total: (p) => p.swapVolume, previous: (p) => p.previous?.swapVolume },
  { value: "fees", label: "Fees", title: "Daily fees", series: "Fees",
    color: "hsl(38 92% 60%)", empty: "No fees in this period",
    pick: (d) => d.revenue, total: (p) => p.revenue.total, previous: (p) => p.previous?.revenue },
  { value: "rebalances", label: "Rebalances", title: "Daily rebalance volume", series: "Rebalance volume",
    color: "hsl(160 60% 45%)", empty: "No rebalances in this period",
    pick: (d) => d.rebalanceVolume, total: (p) => p.rebalanceVolume, previous: (p) => p.previous?.rebalanceVolume },
];

/** Above this many bars a label on each one collides, so only the peak is labelled. */
const LABEL_EVERY_BAR_UP_TO = 14;
const TICK = { fontSize: 12, fill: "var(--muted-foreground)" };

interface Row { date: string; value: number; label: string; rebalanceCount?: number }

function ChartTooltip({ active, payload, series }: {
  active?: boolean;
  payload?: { payload: Row }[];
  series: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{shortDate(row.date)}</p>
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

/** Daily bars for one metric over the last `days` calendar days the series covers. */
export function DailyChart({ daily, metric, days }: { daily: Day[] | undefined; metric: Metric; days: number }) {
  const m = METRICS.find((x) => x.value === metric)!;
  const shown = (daily ?? []).slice(-days);

  // An older Worker does not send the field at all: that is unknown, not zero.
  const unavailable = shown.length > 0 && shown.every((d) => m.pick(d) === undefined);
  const peak = Math.max(0, ...shown.map((d) => m.pick(d) ?? 0));
  const labelAll = shown.length <= LABEL_EVERY_BAR_UP_TO;
  const rows: Row[] = shown.map((d) => {
    const value = m.pick(d) ?? 0;
    return {
      date: d.date,
      value,
      label: value > 0 && (labelAll || value === peak) ? money(value) : "",
      rebalanceCount: metric === "rebalances" ? d.rebalanceCount : undefined,
    };
  });
  const average = rows.length ? rows.reduce((a, r) => a + r.value, 0) / rows.length : 0;

  if (!daily) return <div className="h-52 bg-muted/50 rounded animate-pulse" />;
  if (unavailable) {
    return <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">Data unavailable</div>;
  }
  if (peak === 0) {
    return <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">{m.empty}</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={208}>
      <BarChart data={rows} margin={{ top: 20, right: 72, bottom: 0, left: 4 }}>
        <XAxis dataKey="date" tickFormatter={shortDate} tick={TICK} axisLine={false} tickLine={false}
          interval="preserveStartEnd" minTickGap={28} />
        <YAxis tickFormatter={money} tick={TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip content={<ChartTooltip series={m.series} />} cursor={{ fill: "rgba(161, 161, 170, 0.1)" }} />
        <ReferenceLine y={average} stroke="var(--muted-foreground)" strokeDasharray="3 4" strokeOpacity={0.6}
          label={{ value: `avg ${money(average)}`, position: "right", fontSize: 12, fill: "var(--muted-foreground)" }} />
        <Bar dataKey="value" fill={m.color} maxBarSize={44} radius={[3, 3, 0, 0]} isAnimationActive={false}>
          <LabelList dataKey="label" position="top" fontSize={12} fill="var(--foreground)" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
