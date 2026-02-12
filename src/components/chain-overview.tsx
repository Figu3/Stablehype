"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import type { StablecoinData } from "@/lib/types";

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#10b981",
  "#06b6d4", "#eab308", "#ef4444", "#6366f1", "#14b8a6",
  "#94a3b8",
];

interface ChainOverviewProps {
  data: StablecoinData[] | undefined;
}

export function ChainOverview({ data }: ChainOverviewProps) {
  const chartData = useMemo(() => {
    if (!data) return [];

    const trackedIds = new Set(TRACKED_STABLECOINS.map((s) => s.id));
    const chainTotals: Record<string, number> = {};

    for (const coin of data) {
      if (!trackedIds.has(coin.id) || !coin.chainCirculating) continue;
      for (const [chain, info] of Object.entries(coin.chainCirculating)) {
        const value = info?.current ?? 0;
        if (value > 0) {
          chainTotals[chain] = (chainTotals[chain] ?? 0) + value;
        }
      }
    }

    const sorted = Object.entries(chainTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const top10 = sorted.slice(0, 10);
    const otherValue = sorted.slice(10).reduce((sum, c) => sum + c.value, 0);
    if (otherValue > 0) {
      top10.push({ name: "Other", value: otherValue });
    }

    return top10;
  }, [data]);

  if (chartData.length === 0) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle><h2>Chain Distribution</h2></CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val: number) => formatCurrency(val, 0)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <Tooltip formatter={(value) => [formatCurrency(Number(value)), "TVL"]} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
