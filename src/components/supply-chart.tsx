"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

interface SupplyChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  pegType?: string;
}

function extractSupply(point: Record<string, unknown>, pegType: string): number {
  // Try all possible field names from DefiLlama APIs
  for (const key of ["totalCirculatingUSD", "totalCirculating", "circulating"]) {
    const obj = point[key];
    if (obj && typeof obj === "object" && pegType in (obj as Record<string, unknown>)) {
      const val = (obj as Record<string, number>)[pegType];
      if (typeof val === "number" && val > 0) return val;
    }
  }
  return 0;
}

// Custom tooltip with polished styling
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg backdrop-blur">
      <p className="text-xs font-medium text-muted-foreground">
        {new Date(Number(label)).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  );
}

export function SupplyChart({ data, pegType = "peggedUSD" }: SupplyChartProps) {
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "1y" | "all">("all");

  const chartData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];

    return data
      .map((point) => {
        const rawDate = point.date;
        const ts = typeof rawDate === "number" ? rawDate * 1000 : new Date(rawDate).getTime();
        const supply = extractSupply(point, pegType);
        return { ts, supply };
      })
      .filter((d) => d.supply > 0 && !isNaN(d.ts))
      .map((d) => ({
        ts: d.ts,
        supply: d.supply,
      }));
  }, [data, pegType]);

  const filteredData = useMemo(() => {
    if (range === "all" || chartData.length === 0) return chartData;
    const latest = chartData[chartData.length - 1]?.ts ?? 0;
    const ms: Record<string, number> = {
      "7d": 7 * 86400000,
      "30d": 30 * 86400000,
      "90d": 90 * 86400000,
      "1y": 365 * 86400000,
    };
    return chartData.filter((d) => d.ts >= latest - ms[range]);
  }, [chartData, range]);

  // Compute supply change for the selected range
  const supplyDelta = useMemo(() => {
    if (filteredData.length < 2) return null;
    const first = filteredData[0].supply;
    const last = filteredData[filteredData.length - 1].supply;
    const pct = ((last - first) / first) * 100;
    return { absolute: last - first, pct };
  }, [filteredData]);

  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle as="h2">Circulating Supply</CardTitle>
          {supplyDelta && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-medium font-mono tabular-nums ${supplyDelta.pct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
              <TrendingUp className={`h-3 w-3 ${supplyDelta.pct < 0 ? "rotate-180" : ""}`} />
              {supplyDelta.pct >= 0 ? "+" : ""}{supplyDelta.pct.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(["7d", "30d", "90d", "1y", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${
                range === r
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {r === "all" ? "All" : r.toUpperCase()}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filteredData.length > 0 ? (
          <div role="figure" aria-label={`Circulating supply chart showing ${filteredData.length} data points`} className="animate-in fade-in duration-500">
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={filteredData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="supplyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-frost-blue)" stopOpacity={0.35} />
                  <stop offset="50%" stopColor="var(--color-frost-blue)" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="var(--color-frost-blue)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.08} vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(ts: number) => {
                  const d = new Date(ts);
                  if (range === "7d" || range === "30d") {
                    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }
                  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val: number) => formatCurrency(val, 0)}
                width={65}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "var(--color-frost-blue)", strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              <Area
                type="monotone"
                dataKey="supply"
                stroke="var(--color-frost-blue)"
                fill="url(#supplyGradient)"
                strokeWidth={2}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[350px] flex-col items-center justify-center gap-3">
            <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No supply data available</p>
            <p className="text-xs text-muted-foreground/70">Historical data may take a moment to load.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
