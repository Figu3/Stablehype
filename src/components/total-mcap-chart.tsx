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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { useStablecoinCharts } from "@/hooks/use-stablecoin-charts";

export function TotalMcapChart() {
  const { data, isLoading } = useStablecoinCharts();
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "1y" | "all">("all");

  const chartData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];

    return data.map((point) => {
      const total = Object.values(point.totalCirculatingUSD).reduce(
        (sum, v) => sum + (v ?? 0),
        0
      );
      return {
        ts: point.date * 1000,
        date: new Date(point.date * 1000).toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        total,
      };
    });
  }, [data]);

  const filteredData = useMemo(() => {
    if (range === "all" || chartData.length === 0) return chartData;
    const now = Date.now();
    const ms: Record<string, number> = {
      "7d": 7 * 86400000,
      "30d": 30 * 86400000,
      "90d": 90 * 86400000,
      "1y": 365 * 86400000,
    };
    return chartData.filter((d) => d.ts >= now - ms[range]);
  }, [chartData, range]);

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Total Stablecoin Market Cap</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Total Stablecoin Market Cap</CardTitle>
        <div className="flex gap-1">
          {(["7d", "30d", "90d", "1y", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                range === r
                  ? "bg-primary text-primary-foreground"
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
          <ResponsiveContainer width="100%" height={350} aria-label={`Total stablecoin market cap chart showing ${filteredData.length} data points`}>
            <AreaChart data={filteredData}>
              <defs>
                <linearGradient id="mcapGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(filteredData.length / 8)}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val: number) => formatCurrency(val, 0)}
              />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value)), "Market Cap"]}
                labelStyle={{ fontWeight: "bold" }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#3b82f6"
                fill="url(#mcapGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground">
            No market cap data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
