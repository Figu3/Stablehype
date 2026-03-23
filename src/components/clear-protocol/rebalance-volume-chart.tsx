"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DailyRebalanceVolume } from "@/hooks/use-rebalance-volume";
import type { VolumeRange } from "./swap-volume-chart";

function formatDateLabel(label: string | number | undefined): string {
  const dateStr = String(label ?? "");
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatUSDTooltip(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

const RANGE_OPTIONS: VolumeRange[] = [7, 14, 30, 90];

interface RebalanceVolumeChartProps {
  data: DailyRebalanceVolume[] | undefined;
  range: VolumeRange;
  onRangeChange: (range: VolumeRange) => void;
}

export function RebalanceVolumeChart({ data, range, onRangeChange }: RebalanceVolumeChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading rebalance data…
        </div>
      </div>
    );
  }

  const hasVolume = data.some((d) => d.volumeUSD > 0);

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Daily Rebalance Volume ({range}D)
        </h4>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                range === r
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>

      {!hasVolume ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No rebalances in the last {range} days
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              interval={range > 14 ? Math.floor(range / 7) - 1 : 0}
            />
            <YAxis
              tickFormatter={formatUSDTooltip}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#e4e4e7" }}
              itemStyle={{ color: "#e4e4e7" }}
              labelFormatter={(label) => formatDateLabel(label as string | number | undefined)}
              formatter={(value) => [
                formatUSDTooltip(Number(value ?? 0)),
                "Volume",
              ]}
              cursor={{ fill: "rgba(161, 161, 170, 0.1)" }}
            />
            <Bar dataKey="volumeUSD" radius={[4, 4, 0, 0]} maxBarSize={40} minPointSize={2}>
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.volumeUSD > 0 ? "hsl(160 60% 45%)" : "hsl(var(--muted))"}
                  opacity={entry.volumeUSD > 0 ? 0.85 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
