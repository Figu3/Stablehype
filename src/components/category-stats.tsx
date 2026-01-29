"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import type { StablecoinData } from "@/lib/types";

interface CategoryStatsProps {
  data: StablecoinData[] | undefined;
}

function getCirculatingValue(c: StablecoinData): number {
  if (!c.circulating) return 0;
  return Object.values(c.circulating).reduce((s, v) => s + (v ?? 0), 0);
}

export function CategoryStats({ data }: CategoryStatsProps) {
  const stats = useMemo(() => {
    if (!data) return null;

    const trackedIds = new Set(TRACKED_STABLECOINS.map((s) => s.id));
    const trackedData = data.filter((c) => trackedIds.has(c.id));

    const totalAll = trackedData.reduce((sum, c) => sum + getCirculatingValue(c), 0);

    // Breakdown by governance
    const centralizedIds = new Set(TRACKED_STABLECOINS.filter((s) => s.flags.governance === "centralized").map((s) => s.id));
    const dependentIds = new Set(TRACKED_STABLECOINS.filter((s) => s.flags.governance === "centralized-dependent").map((s) => s.id));
    const decentralizedIds = new Set(TRACKED_STABLECOINS.filter((s) => s.flags.governance === "decentralized").map((s) => s.id));

    const centralizedCoins = trackedData.filter((c) => centralizedIds.has(c.id));
    const dependentCoins = trackedData.filter((c) => dependentIds.has(c.id));
    const decentralizedCoins = trackedData.filter((c) => decentralizedIds.has(c.id));

    // Breakdown by backing
    const rwaIds = new Set(TRACKED_STABLECOINS.filter((s) => s.flags.backing === "rwa-backed").map((s) => s.id));
    const cryptoIds = new Set(TRACKED_STABLECOINS.filter((s) => s.flags.backing === "crypto-backed").map((s) => s.id));
    const algoIds = new Set(TRACKED_STABLECOINS.filter((s) => s.flags.backing === "algorithmic").map((s) => s.id));

    const rwaMcap = trackedData.filter((c) => rwaIds.has(c.id)).reduce((s, c) => s + getCirculatingValue(c), 0);
    const cryptoMcap = trackedData.filter((c) => cryptoIds.has(c.id)).reduce((s, c) => s + getCirculatingValue(c), 0);
    const algoMcap = trackedData.filter((c) => algoIds.has(c.id)).reduce((s, c) => s + getCirculatingValue(c), 0);

    return {
      totalAll,
      totalCount: trackedData.length,
      centralized: { mcap: centralizedCoins.reduce((s, c) => s + getCirculatingValue(c), 0), count: centralizedCoins.length },
      dependent: { mcap: dependentCoins.reduce((s, c) => s + getCirculatingValue(c), 0), count: dependentCoins.length },
      decentralized: { mcap: decentralizedCoins.reduce((s, c) => s + getCirculatingValue(c), 0), count: decentralizedCoins.length },
      rwaMcap, cryptoMcap, algoMcap,
    };
  }, [data]);

  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tracked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalAll)}</div>
            <p className="text-xs text-muted-foreground">{stats.totalCount} stablecoins</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">By Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-yellow-500">CeFi</span>
              <span>{formatCurrency(stats.centralized.mcap, 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-orange-500">CeFi-Dep</span>
              <span>{formatCurrency(stats.dependent.mcap, 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-500">DeFi</span>
              <span>{formatCurrency(stats.decentralized.mcap, 0)}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">By Backing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">RWA</span>
              <span>{formatCurrency(stats.rwaMcap, 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Crypto</span>
              <span>{formatCurrency(stats.cryptoMcap, 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Algo</span>
              <span>{formatCurrency(stats.algoMcap, 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
