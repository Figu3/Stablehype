"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercentChange, formatWorstDeviation } from "@/lib/format";
import { getCirculatingUSD, getPrevWeekUSD } from "@/lib/supply";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import type { StablecoinData, PegSummaryStats } from "@/lib/types";

interface DashboardStatsProps {
  data: StablecoinData[] | undefined;
  pegRates?: Record<string, number>;
  summary: PegSummaryStats | null;
  pegLoading: boolean;
}

export function DashboardStats({ data, pegRates, summary, pegLoading }: DashboardStatsProps) {
  const stats = useMemo(() => {
    if (!data) return null;

    const rates = pegRates ?? { peggedUSD: 1 };
    const trackedIds = new Set(TRACKED_STABLECOINS.map((s) => s.id));
    const trackedData = data.filter((c) => trackedIds.has(c.id));

    const totalAll = trackedData.reduce((sum, c) => sum + getCirculatingUSD(c, rates), 0);
    const totalPrevWeek = trackedData.reduce((sum, c) => sum + getPrevWeekUSD(c, rates), 0);

    return {
      totalAll,
      totalPrevWeek,
      totalCount: trackedData.length,
    };
  }, [data, pegRates]);

  const isLoading = !stats || pegLoading;

  if (isLoading) {
    return (
      <div className="grid gap-5 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-1">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-5 grid-cols-2 sm:grid-cols-4">
      {/* 1. Total Tracked */}
      <Card className="border-l-[3px] border-l-blue-500">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Tracked</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono tracking-tight">{formatCurrency(stats.totalAll)}</div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{stats.totalCount} stablecoins</p>
            {stats.totalPrevWeek > 0 && (
              <span className={`text-xs font-mono ${stats.totalAll >= stats.totalPrevWeek ? "text-green-500" : "text-red-500"}`}>
                {stats.totalAll >= stats.totalPrevWeek ? "\u2191" : "\u2193"} {formatPercentChange(stats.totalAll, stats.totalPrevWeek)} 7d
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Active Depegs */}
      <Link href="/depegs/" className="group">
        <Card className="border-l-[3px] border-l-red-500 transition-colors group-hover:border-l-red-400">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Depegs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight">
                {summary?.activeDepegCount ?? 0}
              </span>
              {(summary?.activeDepegCount ?? 0) > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              coins &gt;5 bps off peg
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* 3. Median Deviation */}
      <Card className="border-l-[3px] border-l-amber-500">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Median Deviation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono tracking-tight">
            {summary?.medianDeviationBps ?? 0} bps
          </div>
          <p className="text-xs text-muted-foreground">
            across all tracked coins
          </p>
        </CardContent>
      </Card>

      {/* 4. Worst Current */}
      <Card className="border-l-[3px] border-l-rose-500">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Worst Current
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary?.worstCurrent ? (
            <>
              <div className="text-2xl font-bold font-mono tracking-tight">
                {formatWorstDeviation(summary.worstCurrent.bps)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.worstCurrent.symbol}
              </p>
            </>
          ) : (
            <div className="text-2xl font-bold font-mono tracking-tight text-green-500">
              All at peg
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
