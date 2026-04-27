"use client";

import { useMemo, useState } from "react";
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

export type RatioRange = 7 | 14 | 30 | 90;
export type RatioUnit = "usd" | "turnover";

const RANGE_OPTIONS: RatioRange[] = [7, 14, 30, 90];

const UNIT_OPTIONS: { value: RatioUnit; label: string }[] = [
  { value: "usd", label: "$" },
  { value: "turnover", label: "% TVL" },
];

const SWAP_COLOR = "hsl(263 70% 58%)";       // violet
const REBALANCE_COLOR = "hsl(160 60% 45%)";  // emerald
const SHARE_LINE = "hsl(38 92% 60%)";        // amber

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatTurnover(value: number): string {
  if (value === 0) return "0%";
  if (value >= 10) return `${value.toFixed(1)}%`;
  if (value >= 1) return `${value.toFixed(2)}%`;
  return `${value.toFixed(3)}%`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateLabel(label: string | number | undefined): string {
  const dateStr = String(label ?? "");
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface TooltipProps {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  unit: RatioUnit;
}

function RatioTooltip({ active, payload, label, unit }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const fmt = unit === "turnover" ? formatTurnover : formatUSD;
  const swapEntry = payload.find((p) => p.dataKey === "swap");
  const rebalEntry = payload.find((p) => p.dataKey === "rebalance");
  const shareEntry = payload.find((p) => p.dataKey === "swapShare");
  const total = (swapEntry?.value ?? 0) + (rebalEntry?.value ?? 0);

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1.5">{formatDateLabel(label)}</p>
      {swapEntry && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: SWAP_COLOR }} />
            Swap
          </span>
          <span className="font-medium tabular-nums">{fmt(swapEntry.value)}</span>
        </div>
      )}
      {rebalEntry && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: REBALANCE_COLOR }} />
            Rebalance
          </span>
          <span className="font-medium tabular-nums">{fmt(rebalEntry.value)}</span>
        </div>
      )}
      {(swapEntry || rebalEntry) && (
        <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-border/50 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{fmt(total)}</span>
        </div>
      )}
      {shareEntry && (
        <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-border/30">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: SHARE_LINE }} />
            Swap share
          </span>
          <span className="font-medium tabular-nums">{shareEntry.value.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}

interface SwapRebalanceRatioChartProps {
  swapData: DailySwapVolume[] | undefined;
  rebalanceData: DailyRebalanceVolume[] | undefined;
  range: RatioRange;
  onRangeChange: (range: RatioRange) => void;
  unit: RatioUnit;
  onUnitChange: (unit: RatioUnit) => void;
  /** Daily TVL in USD, keyed by ISO date — required for `% TVL` mode */
  tvlByDate?: Map<string, number>;
}

export function SwapRebalanceRatioChart({
  swapData,
  rebalanceData,
  range,
  onRangeChange,
  unit,
  onUnitChange,
  tvlByDate,
}: SwapRebalanceRatioChartProps) {
  const isTurnover = unit === "turnover";

  const rows = useMemo(() => {
    const swapByDate = new Map((swapData ?? []).map((d) => [d.date, d.volumeUSD]));
    const rebalByDate = new Map((rebalanceData ?? []).map((d) => [d.date, d.volumeUSD]));

    const dates = Array.from(new Set([...swapByDate.keys(), ...rebalByDate.keys()])).sort();

    return dates.map((date) => {
      const swapUSD = swapByDate.get(date) ?? 0;
      const rebalUSD = rebalByDate.get(date) ?? 0;
      const totalUSD = swapUSD + rebalUSD;
      const swapShare = totalUSD > 0 ? (swapUSD / totalUSD) * 100 : 0;

      if (isTurnover) {
        const tvl = tvlByDate?.get(date);
        if (!tvl || tvl <= 0) {
          return { date, swap: 0, rebalance: 0, swapShare };
        }
        return {
          date,
          swap: (swapUSD / tvl) * 100,
          rebalance: (rebalUSD / tvl) * 100,
          swapShare,
        };
      }
      return { date, swap: swapUSD, rebalance: rebalUSD, swapShare };
    });
  }, [swapData, rebalanceData, tvlByDate, isTurnover]);

  const hasVolume = rows.some((r) => r.swap > 0 || r.rebalance > 0);
  const yFormat = isTurnover ? formatTurnover : formatUSD;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
      {/* Header row: title + range */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Swap vs Rebalance ({range}D)
          </h4>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: SWAP_COLOR }} />
              Swap
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: REBALANCE_COLOR }} />
              Rebalance
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: SHARE_LINE }} />
              Swap share
            </span>
          </div>
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

      {/* Unit toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {UNIT_OPTIONS.map((opt) => {
            const disabled = opt.value === "turnover" && !tvlByDate;
            return (
              <button
                key={opt.value}
                onClick={() => !disabled && onUnitChange(opt.value)}
                disabled={disabled}
                title={disabled ? "Daily TVL not available" : undefined}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                  unit === opt.value
                    ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {!hasVolume ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No activity in the last {range} days
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
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
              tickFormatter={yFormat}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={isTurnover ? 56 : 50}
            />
            <YAxis
              yAxisId="share"
              orientation="right"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={35}
            />
            <Tooltip
              content={<RatioTooltip unit={unit} />}
              cursor={{ fill: "rgba(161, 161, 170, 0.1)" }}
            />
            <Bar
              yAxisId="volume"
              dataKey="swap"
              stackId="vol"
              fill={SWAP_COLOR}
              opacity={0.85}
              maxBarSize={40}
            />
            <Bar
              yAxisId="volume"
              dataKey="rebalance"
              stackId="vol"
              fill={REBALANCE_COLOR}
              opacity={0.85}
              maxBarSize={40}
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="share"
              dataKey="swapShare"
              stroke={SHARE_LINE}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
