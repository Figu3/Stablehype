"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { CHART_PALETTE } from "@/lib/chart-colors";
import type { StablecoinData } from "@/lib/types";

interface ChainDistributionProps {
  coin: StablecoinData;
}

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
        <div role="figure" aria-label={`Chain distribution chart across ${topChains.length} chains`}>
        <ResponsiveContainer width="100%" height={350}>
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
                <Cell key={index} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "0.5rem" }}
              labelStyle={{ color: "var(--color-card-foreground)" }}
              itemStyle={{ color: "var(--color-card-foreground)" }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
