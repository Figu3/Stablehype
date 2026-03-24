"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
} from "recharts";
import type { DailySwapVolume, SwapSource, DailySwapVolumeBySource } from "@/hooks/use-swap-volume";
import type { DailyRebalanceVolume, RebalanceType, DailyRebalanceVolumeByType } from "@/hooks/use-rebalance-volume";

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

// Swap sources render bottom-to-top: other → cowswap → velora → direct → kyberswap
const SWAP_SOURCE_ORDER: SwapSource[] = ["other", "mev", "cowswap", "velora", "direct", "kyberswap"];

// Rebalance types render bottom-to-top: external → internal
const REBALANCE_TYPE_ORDER: RebalanceType[] = ["external", "internal"];

const SWAP_SOURCE_COLORS: Record<SwapSource, string> = {
  kyberswap: "hsl(263 70% 58%)",
  velora: "hsl(200 70% 50%)",
  cowswap: "hsl(32 95% 55%)",
  direct: "hsl(160 60% 45%)",
  mev: "hsl(350 70% 55%)",
  other: "hsl(240 5% 60%)",
};

const REBALANCE_TYPE_COLORS: Record<RebalanceType, string> = {
  internal: "hsl(160 60% 45%)",
  external: "hsl(32 95% 55%)",
};

const SWAP_SOURCE_LABELS: Record<SwapSource, string> = {
  kyberswap: "KyberSwap",
  velora: "Velora",
  cowswap: "CowSwap",
  direct: "Direct",
  mev: "MEV Bots",
  other: "Other",
};

const REBALANCE_TYPE_LABELS: Record<RebalanceType, string> = {
  internal: "Internal",
  external: "External",
};

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

// ── Custom tooltip for breakdown modes ──────────────────────────────────────

interface CustomTooltipProps {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  mode: "swap" | "rebalance" | "all";
  volumeType: VolumeType;
}

function BreakdownTooltip({ active, payload, label, mode, volumeType }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const dateLabel = formatDateLabel(label);

  if (mode === "swap") {
    // Filter out zero-volume sources, show total
    const nonZero = payload.filter((p) => (p.value as number) > 0);
    if (nonZero.length === 0) return null;
    const total = nonZero.reduce((sum, p) => sum + (p.value as number), 0);

    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
        <p className="text-muted-foreground mb-1.5">{dateLabel}</p>
        {nonZero.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              {SWAP_SOURCE_LABELS[entry.dataKey as SwapSource] ?? entry.dataKey}
            </span>
            <span className="font-medium tabular-nums">{formatUSD(entry.value)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-border/50 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatUSD(total)}</span>
        </div>
      </div>
    );
  }

  if (mode === "rebalance") {
    // Show all types (including zero), show total
    const total = payload.reduce((sum, p) => sum + (p.value as number), 0);

    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
        <p className="text-muted-foreground mb-1.5">{dateLabel}</p>
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              {REBALANCE_TYPE_LABELS[entry.dataKey as RebalanceType] ?? entry.dataKey}
            </span>
            <span className="font-medium tabular-nums">{formatUSD(entry.value)}</span>
          </div>
        ))}
        {payload.length > 1 && (
          <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-border/50 font-medium">
            <span>Total</span>
            <span className="tabular-nums">{formatUSD(total)}</span>
          </div>
        )}
      </div>
    );
  }

  // "all" mode — default formatting
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-1">{dateLabel}</p>
      {payload.map((entry) => {
        if (entry.dataKey === "totalVolume") {
          const label =
            volumeType === "swap" ? "Swap Volume"
              : volumeType === "rebalance" ? "Rebalance Volume"
              : "Total Volume";
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <span>{label}</span>
              <span className="font-medium tabular-nums">{formatUSD(entry.value)}</span>
            </div>
          );
        }
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span>Rebalanced</span>
            <span className="font-medium tabular-nums">{entry.value.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

const RANGE_OPTIONS: VolumeRange[] = [7, 14, 30, 90];

interface VolumeChartProps {
  swapData: DailySwapVolume[] | undefined;
  rebalanceData: DailyRebalanceVolume[] | undefined;
  swapBySourceData: DailySwapVolumeBySource[] | undefined;
  rebalanceByTypeData: DailyRebalanceVolumeByType[] | undefined;
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
  swapBySourceData,
  rebalanceByTypeData,
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

  // Determine rendering mode
  const showSwapBreakdown =
    volumeType === "swap" && swapBySourceData && swapBySourceData.length > 0;
  const showRebalanceBreakdown =
    volumeType === "rebalance" && rebalanceByTypeData && rebalanceByTypeData.length > 0;
  const showRebalanceLine = volumeType === "all";
  const isBreakdownMode = showSwapBreakdown || showRebalanceBreakdown;

  // Build chart data
  type ChartRow = { date: string } & Record<string, number | string>;

  let chartData: ChartRow[];
  let hasVolume: boolean;

  if (showSwapBreakdown) {
    chartData = swapBySourceData!.map((d) => {
      const row: ChartRow = { date: d.date };
      for (const source of SWAP_SOURCE_ORDER) {
        row[source] = d.sources[source]?.volumeUSD ?? 0;
      }
      return row;
    });
    hasVolume = chartData.some((d) =>
      SWAP_SOURCE_ORDER.some((s) => (d[s] as number) > 0)
    );
  } else if (showRebalanceBreakdown) {
    chartData = rebalanceByTypeData!.map((d) => {
      const row: ChartRow = { date: d.date };
      for (const type of REBALANCE_TYPE_ORDER) {
        row[type] = d.types[type]?.volumeUSD ?? 0;
      }
      return row;
    });
    hasVolume = chartData.some((d) =>
      REBALANCE_TYPE_ORDER.some((t) => (d[t] as number) > 0)
    );
  } else {
    // "all" mode (or swap/rebalance without breakdown data)
    const rebalanceMap = new Map<string, number>();
    for (const d of rebalanceData ?? []) {
      rebalanceMap.set(d.date, d.volumeUSD);
    }

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

    chartData = combined as unknown as ChartRow[];
    hasVolume = combined.some((d) => d.totalVolume > 0);
  }

  // Bar color for single-bar modes
  const barFill =
    volumeType === "rebalance" ? "hsl(160 60% 45%)" : "hsl(263 70% 58%)";

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

      {/* Breakdown legend */}
      {isBreakdownMode && (
        <div className="flex flex-wrap gap-3">
          {showSwapBreakdown &&
            [...SWAP_SOURCE_ORDER].reverse().map((source) => (
              <span key={source} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: SWAP_SOURCE_COLORS[source] }}
                />
                {SWAP_SOURCE_LABELS[source]}
              </span>
            ))}
          {showRebalanceBreakdown &&
            [...REBALANCE_TYPE_ORDER].reverse().map((type) => (
              <span key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: REBALANCE_TYPE_COLORS[type] }}
                />
                {REBALANCE_TYPE_LABELS[type]}
              </span>
            ))}
        </div>
      )}

      {!hasVolume ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No activity in the last {range} days
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
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
              content={
                <BreakdownTooltip
                  mode={showSwapBreakdown ? "swap" : showRebalanceBreakdown ? "rebalance" : "all"}
                  volumeType={volumeType}
                />
              }
              cursor={{ fill: "rgba(161, 161, 170, 0.1)" }}
            />

            {/* Stacked bars — swap breakdown */}
            {showSwapBreakdown &&
              SWAP_SOURCE_ORDER.map((source, idx) => (
                <Bar
                  key={source}
                  yAxisId="volume"
                  dataKey={source}
                  stackId="swap"
                  fill={SWAP_SOURCE_COLORS[source]}
                  opacity={0.85}
                  maxBarSize={40}
                  radius={
                    idx === SWAP_SOURCE_ORDER.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
                  }
                />
              ))}

            {/* Stacked bars — rebalance breakdown */}
            {showRebalanceBreakdown &&
              REBALANCE_TYPE_ORDER.map((type, idx) => (
                <Bar
                  key={type}
                  yAxisId="volume"
                  dataKey={type}
                  stackId="rebalance"
                  fill={REBALANCE_TYPE_COLORS[type]}
                  opacity={0.85}
                  maxBarSize={40}
                  radius={
                    idx === REBALANCE_TYPE_ORDER.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
                  }
                />
              ))}

            {/* Single bar — all / swap (no breakdown) / rebalance (no breakdown) */}
            {!isBreakdownMode && (
              <Bar
                yAxisId="volume"
                dataKey="totalVolume"
                fill={barFill}
                opacity={0.75}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            )}

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

      {/* Doughnut charts: swap source share + rebalance type share */}
      <SourceDoughnuts
        swapBySourceData={swapBySourceData}
        rebalanceByTypeData={rebalanceByTypeData}
        range={range}
      />
    </div>
  );
}

// ── Doughnut charts ─────────────────────────────────────────────────────────

// Display order for legend: most important first
const SWAP_LEGEND_ORDER: SwapSource[] = ["kyberswap", "direct", "cowswap", "velora", "mev", "other"];
const REBALANCE_LEGEND_ORDER: RebalanceType[] = ["internal", "external"];

interface DoughnutEntry {
  name: string;
  value: number;
  color: string;
  fill: string;
}

interface DoughnutTooltipProps {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  total: number;
}

function DoughnutTooltip({ active, payload, total }: DoughnutTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs shadow-md">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-2 h-2 rounded-sm"
          style={{ backgroundColor: entry.payload?.color }}
        />
        <span>{entry.name}</span>
        <span className="font-medium tabular-nums ml-auto pl-3">{formatUSD(entry.value)}</span>
        <span className="text-muted-foreground">({pct}%)</span>
      </div>
    </div>
  );
}

function SourceDoughnuts({
  swapBySourceData,
  rebalanceByTypeData,
  range,
}: {
  swapBySourceData: DailySwapVolumeBySource[] | undefined;
  rebalanceByTypeData: DailyRebalanceVolumeByType[] | undefined;
  range: VolumeRange;
}) {
  // Aggregate swap sources across the date range
  const swapTotals: Record<SwapSource, number> = {
    kyberswap: 0, velora: 0, cowswap: 0, direct: 0, mev: 0, other: 0,
  };
  for (const day of swapBySourceData ?? []) {
    for (const src of SWAP_LEGEND_ORDER) {
      swapTotals[src] += day.sources[src]?.volumeUSD ?? 0;
    }
  }
  const swapTotal = Object.values(swapTotals).reduce((a, b) => a + b, 0);
  const swapSlices: DoughnutEntry[] = SWAP_LEGEND_ORDER
    .filter((src) => swapTotals[src] > 0)
    .map((src) => ({
      name: SWAP_SOURCE_LABELS[src],
      value: swapTotals[src],
      color: SWAP_SOURCE_COLORS[src],
      fill: SWAP_SOURCE_COLORS[src],
    }));

  // Aggregate rebalance types across the date range
  const rebalTotals: Record<RebalanceType, number> = { internal: 0, external: 0 };
  for (const day of rebalanceByTypeData ?? []) {
    for (const t of REBALANCE_LEGEND_ORDER) {
      rebalTotals[t] += day.types[t]?.volumeUSD ?? 0;
    }
  }
  const rebalTotal = Object.values(rebalTotals).reduce((a, b) => a + b, 0);
  const rebalSlices: DoughnutEntry[] = REBALANCE_LEGEND_ORDER
    .filter((t) => rebalTotals[t] > 0)
    .map((t) => ({
      name: REBALANCE_TYPE_LABELS[t],
      value: rebalTotals[t],
      color: REBALANCE_TYPE_COLORS[t],
      fill: REBALANCE_TYPE_COLORS[t],
    }));

  if (swapSlices.length === 0 && rebalSlices.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 pt-4">
      {/* Swap source doughnut */}
      <DoughnutCard
        title={`Swap Sources (${range}D)`}
        slices={swapSlices}
        total={swapTotal}
        emptyLabel="No swaps"
      />

      {/* Rebalance type doughnut */}
      <DoughnutCard
        title={`Rebalance Types (${range}D)`}
        slices={rebalSlices}
        total={rebalTotal}
        emptyLabel="No rebalances"
      />
    </div>
  );
}

function DoughnutCard({
  title,
  slices,
  total,
  emptyLabel,
}: {
  title: string;
  slices: DoughnutEntry[];
  total: number;
  emptyLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h5>
      {slices.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie
                data={slices}
                cx="50%"
                cy="50%"
                innerRadius={32}
                outerRadius={55}
                dataKey="value"
                nameKey="name"
                paddingAngle={2}
                isAnimationActive={false}
              />
              <Tooltip content={<DoughnutTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-1 w-full">
            {slices.map((entry) => {
              const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0";
              return (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-muted-foreground">{entry.name}</span>
                  <span className="font-medium tabular-nums ml-auto">{pct}%</span>
                </div>
              );
            })}
            <div className="text-xs text-muted-foreground pt-1 mt-0.5 border-t border-border/40 font-medium text-right">
              Total: {formatUSD(total)}
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-[120px] text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
