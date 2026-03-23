"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DailySwapVolume } from "@/hooks/use-swap-volume";
import type { DailyRebalanceVolume } from "@/hooks/use-rebalance-volume";

export type VolumeRange = 7 | 14 | 30 | 90;
export type VolumeType = "all" | "swap" | "rebalance";

export const TOKEN_FILTERS = [
  { value: null, label: "All" },
  { value: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", label: "USDC" },
  { value: "0xdac17f958d2ee523a2206206994597c13d831ec7", label: "USDT" },
  { value: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f", label: "GHO" },
  { value: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", label: "USDe" },
  { value: "0xdc035d45d973e3ec169d2276ddab16f1e407384f", label: "USDS" },
] as const;

const TYPE_OPTIONS: { value: VolumeType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "swap", label: "Swaps" },
  { value: "rebalance", label: "Rebalances" },
];

interface CombinedDay {
  date: string;
  totalVolume: number;
  rebalancePct: number;
}

function formatDateLabel(label: string | number | undefined): string {
  const dateStr = String(label ?? "");
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

const RANGE_OPTIONS: VolumeRange[] = [7, 14, 30, 90];

interface VolumeChartProps {
  swapData: DailySwapVolume[] | undefined;
  rebalanceData: DailyRebalanceVolume[] | undefined;
  range: VolumeRange;
  onRangeChange: (range: VolumeRange) => void;
  tokenFilter: string | null;
  onTokenFilterChange: (token: string | null) => void;
  volumeType: VolumeType;
  onVolumeTypeChange: (type: VolumeType) => void;
}

export function VolumeChart({
  swapData,
  rebalanceData,
  range,
  onRangeChange,
  tokenFilter,
  onTokenFilterChange,
  volumeType,
  onVolumeTypeChange,
}: VolumeChartProps) {
  if (!swapData || swapData.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading volume data…
        </div>
      </div>
    );
  }

  const rebalanceMap = new Map<string, number>();
  for (const d of rebalanceData ?? []) {
    rebalanceMap.set(d.date, d.volumeUSD);
  }

  const showRebalanceLine = volumeType === "all";

  const combined: CombinedDay[] = swapData.map((d) => {
    const swapVol = d.volumeUSD;
    const rebalVol = rebalanceMap.get(d.date) ?? 0;

    let barVolume: number;
    if (volumeType === "swap") barVolume = swapVol;
    else if (volumeType === "rebalance") barVolume = rebalVol;
    else barVolume = swapVol + rebalVol;

    const totalForPct = swapVol + rebalVol;
    return {
      date: d.date,
      totalVolume: barVolume,
      rebalancePct: totalForPct > 0 ? (rebalVol / totalForPct) * 100 : 0,
    };
  });

  const hasVolume = combined.some((d) => d.totalVolume > 0);

  // Bar color changes by type filter
  const barFill =
    volumeType === "rebalance"
      ? "hsl(160 60% 45%)"
      : "hsl(263 70% 58%)";

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
      {/* Header row: title + range */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Daily Volume ({range}D)
          </h4>
          {showRebalanceLine && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-violet-500/80" />
                Volume
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 rounded bg-emerald-400" />
                Rebalance %
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                range === r
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>

      {/* Filter row: type + token */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <div className="flex gap-1">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onVolumeTypeChange(opt.value)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                volumeType === opt.value
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="text-border/60">|</span>

        {/* Token filter */}
        <div className="flex gap-1 flex-wrap">
          {TOKEN_FILTERS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => onTokenFilterChange(opt.value)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                tokenFilter === opt.value
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!hasVolume ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No activity in the last {range} days
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={combined} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              interval={range > 14 ? Math.floor(range / 7) - 1 : 0}
            />
            <YAxis
              yAxisId="volume"
              tickFormatter={formatUSD}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            {showRebalanceLine && (
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
            )}
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: number, name: string) => {
                if (name === "totalVolume") {
                  const label = volumeType === "swap" ? "Swap Volume"
                    : volumeType === "rebalance" ? "Rebalance Volume"
                    : "Total Volume";
                  return [formatUSD(value), label];
                }
                return [`${value.toFixed(0)}%`, "Rebalanced"];
              }) as any}
              cursor={{ fill: "rgba(161, 161, 170, 0.1)" }}
            />
            <Bar
              yAxisId="volume"
              dataKey="totalVolume"
              fill={barFill}
              opacity={0.75}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            {showRebalanceLine && (
              <Line
                yAxisId="pct"
                dataKey="rebalancePct"
                stroke="hsl(160 60% 55%)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
