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
        date: new Date(d.ts).toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
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

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle><h2>Circulating Supply</h2></CardTitle>
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
          <ResponsiveContainer width="100%" height={350} aria-label={`Circulating supply chart showing ${filteredData.length} data points`}>
            <AreaChart data={filteredData}>
              <defs>
                <linearGradient id="supplyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} interval={Math.floor(filteredData.length / 8)} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val: number) => formatCurrency(val, 0)}
              />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value)), "Supply"]}
                labelStyle={{ fontWeight: "bold" }}
              />
              <Area
                type="monotone"
                dataKey="supply"
                stroke="#3b82f6"
                fill="url(#supplyGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground">
            No supply data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
