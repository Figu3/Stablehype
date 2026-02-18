"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { StablecoinData } from "@/lib/types";

interface ChainDistributionProps {
  coin: StablecoinData;
}

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#10b981",
  "#06b6d4", "#eab308", "#ef4444", "#6366f1", "#14b8a6",
  "#f59e0b", "#84cc16",
];

export function ChainDistribution({ coin }: ChainDistributionProps) {
  if (!coin.chainCirculating) {
    return null;
  }

  const chains = Object.entries(coin.chainCirculating)
    .map(([chain, data]) => ({
      name: chain,
      value: data?.current ?? 0,
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  if (chains.length === 0) return null;

  // Group small chains into "Other"
  const TOP_N = 8;
  const topChains = chains.slice(0, TOP_N);
  const otherValue = chains.slice(TOP_N).reduce((sum, c) => sum + c.value, 0);
  if (otherValue > 0) {
    topChains.push({ name: "Other", value: otherValue });
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle as="h2">Chain Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350} aria-label={`Chain distribution chart across ${topChains.length} chains`}>
          <PieChart>
            <Pie
              data={topChains}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={120}
              dataKey="value"
              nameKey="name"
              paddingAngle={2}
            >
              {topChains.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
