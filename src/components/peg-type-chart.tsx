"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import type { StablecoinData } from "@/lib/types";

interface AltPegDominanceProps {
  data: StablecoinData[] | undefined;
}

const PEG_LABELS: Record<string, string> = {
  GOLD: "Gold",
  EUR: "Euro",
  RUB: "Ruble",
  BRL: "Real",
  CHF: "Franc",
  GBP: "Pound",
  VAR: "Variable",
  OTHER: "Other",
};

const PEG_COLORS: Record<string, { text: string; bg: string }> = {
  GOLD: { text: "text-yellow-500", bg: "bg-yellow-500" },
  EUR: { text: "text-violet-500", bg: "bg-violet-500" },
  RUB: { text: "text-red-500", bg: "bg-red-500" },
  BRL: { text: "text-orange-500", bg: "bg-orange-500" },
  CHF: { text: "text-pink-500", bg: "bg-pink-500" },
  GBP: { text: "text-cyan-500", bg: "bg-cyan-500" },
};

function getCirculating(c: StablecoinData): number {
  if (!c.circulating) return 0;
  return Object.values(c.circulating).reduce((s, v) => s + (v ?? 0), 0);
}

export function PegTypeChart({ data }: AltPegDominanceProps) {
  const stats = useMemo(() => {
    if (!data) return null;

    const trackedIds = new Set(TRACKED_STABLECOINS.map((s) => s.id));
    const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));

    // Group market caps by peg currency (excluding USD)
    const pegTotals: Record<string, number> = {};
    let altTotal = 0;

    for (const coin of data) {
      if (!trackedIds.has(coin.id)) continue;
      const meta = metaById.get(coin.id);
      if (!meta || meta.flags.pegCurrency === "USD") continue;

      const mcap = getCirculating(coin);
      const peg = meta.flags.pegCurrency;
      pegTotals[peg] = (pegTotals[peg] ?? 0) + mcap;
      altTotal += mcap;
    }

    // Sort by mcap descending, take top 3
    const sorted = Object.entries(pegTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    return { categories: sorted, altTotal };
  }, [data]);

  if (!stats || stats.altTotal === 0) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle><h2>Non-USD-Pegged Stablecoin Dominance</h2></CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats.categories.map(([peg, mcap]) => {
          const dominance = (mcap / stats.altTotal) * 100;
          const colors = PEG_COLORS[peg] ?? { text: "text-muted-foreground", bg: "bg-muted-foreground" };
          return (
            <div key={peg} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className={`text-sm font-medium ${colors.text}`}>
                  {PEG_LABELS[peg] ?? peg}
                </span>
                <span className="text-2xl font-bold font-mono">{dominance.toFixed(1)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${colors.bg}`}
                  style={{ width: `${dominance}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground font-mono">{formatCurrency(mcap)}</p>
            </div>
          );
        })}
        <div className="pt-2 border-t">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Total non-USD</span>
            <span className="font-mono">{formatCurrency(stats.altTotal)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
