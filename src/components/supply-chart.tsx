"use client";

import { useMemo } from "react";
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
        date: new Date(d.ts).toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        supply: d.supply,
      }));
  }, [data, pegType]);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Circulating Supply</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="supplyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
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
