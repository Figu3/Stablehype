"use client";

import { Bar, BarChart, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ClearV1Overview, ClearV1Period } from "@/hooks/use-clear-v1";
import { bps, inBps, money, shortDate } from "./helpers";

export type Metric = "volume" | "fees" | "avgFee" | "rebalances";
type Day = ClearV1Overview["daily"][number];

/** Who receives a swap fee, in the order the bars stack. */
export const FEE_PARTS = [
  { key: "lp", label: "LPs", color: "hsl(199 89% 55%)" },
  { key: "treasury", label: "Treasury", color: "hsl(221 70% 58%)" },
  { key: "trader", label: "Traders", color: "hsl(280 55% 65%)" },
] as const;
type FeePart = (typeof FEE_PARTS)[number]["key"];
export type FeeSplit = Record<FeePart, number>;

const sumSplit = (f: FeeSplit) => f.lp + f.treasury + f.trader;

/** Swap fees of a period by recipient, in bps of swap volume. Null without volume. */
export function periodFeeSplit(p: ClearV1Period): FeeSplit | null {
  const of = (v: number) => inBps(v, p.swapVolume);
  const lp = of(p.revenue.swapLp), treasury = of(p.revenue.swapTreasury), trader = of(p.revenue.traderRebate);
  return lp === null || treasury === null || trader === null ? null : { lp, treasury, trader };
}

/** One day's swap fees by recipient in bps. A day without swaps has no fee rate. */
function dayFeeSplit(d: Day): FeeSplit | null | undefined {
  if (!d.swapFees) return undefined;
  if (d.swapVolume <= 0) return null;
  const of = (v: number) => (v / d.swapVolume) * 10_000;
  return { lp: of(d.swapFees.lp), treasury: of(d.swapFees.treasury), trader: of(d.swapFees.trader) };
}

export const METRICS: {
  value: Metric;
  label: string;
  title: string;
  series: string;
  color: string;
  empty: string;
  format: (v: number) => string;
  /** The day's bar. Undefined: an older Worker did not send it. Null: no value that day. */
  pick: (d: Day) => number | null | undefined;
  /** Headline of the tile for a period. */
  headline: (p: ClearV1Period) => string | undefined;
  /** Totals that can be compared with the window before. Rates are not compared. */
  total?: (p: ClearV1Period) => number | undefined;
  previous?: (p: ClearV1Period) => number | undefined;
}[] = [
  { value: "volume", label: "Volume", title: "Daily swap volume", series: "Swap volume",
    color: "hsl(263 70% 62%)", empty: "No swaps in this period", format: money,
    pick: (d) => d.swapVolume, headline: (p) => money(p.swapVolume),
    total: (p) => p.swapVolume, previous: (p) => p.previous?.swapVolume },
  { value: "fees", label: "Fees", title: "Daily fees", series: "Fees",
    color: "hsl(38 92% 60%)", empty: "No fees in this period", format: money,
    pick: (d) => d.revenue, headline: (p) => money(p.revenue.total),
    total: (p) => p.revenue.total, previous: (p) => p.previous?.revenue },
  { value: "avgFee", label: "Average fee", title: "Daily average swap fee in bps, by recipient", series: "Average fee",
    color: FEE_PARTS[0].color, empty: "No swaps in this period", format: bps,
    pick: (d) => { const s = dayFeeSplit(d); return s ? sumSplit(s) : s; },
    headline: (p) => { const s = periodFeeSplit(p); return s ? bps(sumSplit(s)) : undefined; } },
  { value: "rebalances", label: "Rebalances", title: "Daily rebalance volume", series: "Rebalance volume",
    color: "hsl(160 60% 45%)", empty: "No rebalances in this period", format: money,
    pick: (d) => d.rebalanceVolume,
    // Rebalanced value against what was swapped: how much moving the reserves the flow cost.
    headline: (p) => p.rebalanceVolume === undefined || p.swapVolume <= 0
      ? undefined : `${Math.round((p.rebalanceVolume / p.swapVolume) * 100)}%` },
];

/** Above this many bars a label on each one collides, so only the peak is labelled. */
const LABEL_EVERY_BAR_UP_TO = 14;
const TICK = { fontSize: 12, fill: "var(--muted-foreground)" };

interface Row extends Partial<FeeSplit> { date: string; value: number; label: string; rebalanceCount?: number; split?: FeeSplit }

function ChartTooltip({ active, payload, series, format }: {
  active?: boolean;
  payload?: { payload: Row }[];
  series: string;
  format: (v: number) => string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const line = (name: string, value: string, color?: string) => (
    <div key={name} className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />}
        {name}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{shortDate(row.date)}</p>
      {line(series, format(row.value))}
      {row.split && FEE_PARTS.map((part) => line(part.label, bps(row.split![part.key]), part.color))}
      {row.rebalanceCount !== undefined && line("Rebalances", String(row.rebalanceCount))}
    </div>
  );
}

/** Daily bars for one metric over the last `days` calendar days the series covers. */
export function DailyChart({ daily, metric, days }: { daily: Day[] | undefined; metric: Metric; days: number }) {
  const m = METRICS.find((x) => x.value === metric)!;
  const shown = (daily ?? []).slice(-days);
  const stacked = metric === "avgFee";

  // An older Worker does not send the field at all: that is unknown, not zero.
  const unavailable = shown.length > 0 && shown.every((d) => m.pick(d) === undefined);
  const peak = Math.max(0, ...shown.map((d) => m.pick(d) ?? 0));
  const labelAll = shown.length <= LABEL_EVERY_BAR_UP_TO;
  const rows: Row[] = shown.map((d) => {
    const value = m.pick(d) ?? 0;
    const split = stacked ? dayFeeSplit(d) ?? undefined : undefined;
    return {
      date: d.date,
      value,
      // On the bps chart the unit is in the title, and "16.25 bps" wraps above a narrow bar.
      label: value > 0 && (labelAll || value === peak) ? (stacked ? value.toFixed(2) : m.format(value)) : "",
      rebalanceCount: metric === "rebalances" ? d.rebalanceCount : undefined,
      split,
      ...split,
    };
  });
  // A rate averages over the volume behind it, not over days: a quiet day must not count as much as a busy one.
  const volume = shown.reduce((a, d) => a + d.swapVolume, 0);
  const average = stacked
    ? inBps(shown.reduce((a, d) => a + (d.swapFees ? sumSplit(d.swapFees) : 0), 0), volume) ?? 0
    : rows.length ? rows.reduce((a, r) => a + r.value, 0) / rows.length : 0;

  if (!daily) return <div className="h-52 bg-muted/50 rounded animate-pulse" />;
  if (unavailable) {
    return <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">Data unavailable</div>;
  }
  if (peak === 0) {
    return <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">{m.empty}</div>;
  }
  const bar = { maxBarSize: 44, isAnimationActive: false } as const;
  const top = <LabelList dataKey="label" position="top" fontSize={12} fill="var(--foreground)" />;
  return (
    <ResponsiveContainer width="100%" height={208}>
      <BarChart data={rows} margin={{ top: 20, right: 88, bottom: 0, left: 4 }}>
        <XAxis dataKey="date" tickFormatter={shortDate} tick={TICK} axisLine={false} tickLine={false}
          interval="preserveStartEnd" minTickGap={28} />
        <YAxis tickFormatter={stacked ? (v: number) => `${v}` : money} tick={TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip content={<ChartTooltip series={m.series} format={m.format} />} cursor={{ fill: "rgba(161, 161, 170, 0.1)" }} />
        <ReferenceLine y={average} stroke="var(--muted-foreground)" strokeDasharray="3 4" strokeOpacity={0.6}
          label={{ value: `avg ${m.format(average)}`, position: "right", fontSize: 12, fill: "var(--muted-foreground)" }} />
        {stacked ? FEE_PARTS.map((part, i) => (
          <Bar key={part.key} dataKey={part.key} stackId="fee" fill={part.color} {...bar}
            radius={i === FEE_PARTS.length - 1 ? [3, 3, 0, 0] : 0}>
            {i === FEE_PARTS.length - 1 && top}
          </Bar>
        )) : (
          <Bar dataKey="value" fill={m.color} radius={[3, 3, 0, 0]} {...bar}>{top}</Bar>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
