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

    // Dominance: USDT vs USDC vs rest
    let usdt = 0;
    let usdc = 0;
    let rest = 0;
    for (const coin of trackedData) {
      const mcap = getCirculatingValue(coin);
      if (coin.id === "1") usdt = mcap;
      else if (coin.id === "2") usdc = mcap;
      else rest += mcap;
    }

    const centralizedMcap = centralizedCoins.reduce((s, c) => s + getCirculatingValue(c), 0);
    const dependentMcap = dependentCoins.reduce((s, c) => s + getCirculatingValue(c), 0);
    const decentralizedMcap = decentralizedCoins.reduce((s, c) => s + getCirculatingValue(c), 0);
    const govTotal = centralizedMcap + dependentMcap + decentralizedMcap;

    return {
      totalAll,
      totalCount: trackedData.length,
      centralizedMcap,
      dependentMcap,
      decentralizedMcap,
      cefiPct: govTotal > 0 ? (centralizedMcap / govTotal) * 100 : 0,
      depPct: govTotal > 0 ? (dependentMcap / govTotal) * 100 : 0,
      defiPct: govTotal > 0 ? (decentralizedMcap / govTotal) * 100 : 0,
      usdt, usdc, rest,
    };
  }, [data]);

  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-5 sm:grid-cols-3">
        <Card className="rounded-2xl border-l-[3px] border-l-blue-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Tracked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono tracking-tight">{formatCurrency(stats.totalAll)}</div>
            <p className="text-xs text-muted-foreground">{stats.totalCount} stablecoins</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-l-[3px] border-l-yellow-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">By Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
              <div className="h-full bg-yellow-500" style={{ width: `${stats.cefiPct}%` }} />
              <div className="h-full bg-orange-500" style={{ width: `${stats.depPct}%` }} />
              <div className="h-full bg-green-500" style={{ width: `${stats.defiPct}%` }} />
            </div>
            <div className="space-y-1">
              {([
                { label: "CeFi", pct: stats.cefiPct, mcap: stats.centralizedMcap, text: "text-yellow-500", bg: "bg-yellow-500" },
                { label: "CeFi-Dep", pct: stats.depPct, mcap: stats.dependentMcap, text: "text-orange-500", bg: "bg-orange-500" },
                { label: "DeFi", pct: stats.defiPct, mcap: stats.decentralizedMcap, text: "text-green-500", bg: "bg-green-500" },
              ] as const).map((t) => (
                <div key={t.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${t.bg}`} />
                    <span className={`font-medium ${t.text}`}>{t.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold font-mono text-xs">{t.pct.toFixed(1)}%</span>
                    <span className="text-muted-foreground text-xs font-mono">{formatCurrency(t.mcap, 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-l-[3px] border-l-sky-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dominance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-emerald-500">USDT</span>
              <span className="font-mono font-semibold">{formatCurrency(stats.usdt, 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-sky-400">USDC</span>
              <span className="font-mono font-semibold">{formatCurrency(stats.usdc, 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Others</span>
              <span className="font-mono font-semibold">{formatCurrency(stats.rest, 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
