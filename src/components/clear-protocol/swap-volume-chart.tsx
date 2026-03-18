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
import type { DailySwapVolume } from "@/hooks/use-swap-volume";

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
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function SwapVolumeChart({ data }: { data: DailySwapVolume[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading swap data…
        </div>
      </div>
    );
  }

  const hasVolume = data.some((d) => d.volumeUSD > 0);

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Daily Swap Volume (7D)
        </h4>
      </div>

      {!hasVolume ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No swaps in the last 7 days
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatUSDTooltip}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(label) => formatDateLabel(label as string | number | undefined)}
              formatter={(value) => [
                formatUSDTooltip(Number(value ?? 0)),
                "Volume",
              ]}
              cursor={{ fill: "hsl(var(--muted-foreground) / 0.1)" }}
            />
            <Bar dataKey="volumeUSD" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.volumeUSD > 0 ? "hsl(263 70% 58%)" : "hsl(var(--muted))"}
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
