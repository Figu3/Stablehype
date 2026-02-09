"use client";

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
  data: { date: string; totalCirculating: Record<string, number>; totalCirculatingUSD: Record<string, number> }[];
}

export function SupplyChart({ data }: SupplyChartProps) {
  const chartData = data
    ?.map((point) => ({
      date: new Date(typeof point.date === "number" ? point.date * 1000 : point.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      supply: point.totalCirculatingUSD?.peggedUSD ?? point.totalCirculating?.peggedUSD ?? 0,
    }))
    .filter((d) => d.supply > 0);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Circulating Supply</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData && chartData.length > 0 ? (
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
