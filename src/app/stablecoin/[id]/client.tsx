"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useStablecoinDetail, useStablecoins } from "@/hooks/use-stablecoins";
import { findStablecoinMeta, TRACKED_STABLECOINS } from "@/lib/stablecoins";
import { formatCurrency, formatPrice, formatPegDeviation, formatPercentChange, formatSupply } from "@/lib/format";
import { derivePegRates, getPegReference } from "@/lib/peg-rates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SupplyChart } from "@/components/supply-chart";
import { ChainDistribution } from "@/components/chain-distribution";
import { DepegHistory } from "@/components/depeg-history";
import type { StablecoinData } from "@/lib/types";

function getCirculatingValue(c: StablecoinData): number {
  if (!c.circulating) return 0;
  return Object.values(c.circulating).reduce((s, v) => s + (v ?? 0), 0);
}
function getPrevDayValue(c: StablecoinData): number {
  if (!c.circulatingPrevDay) return 0;
  return Object.values(c.circulatingPrevDay).reduce((s, v) => s + (v ?? 0), 0);
}
function getPrevWeekValue(c: StablecoinData): number {
  if (!c.circulatingPrevWeek) return 0;
  return Object.values(c.circulatingPrevWeek).reduce((s, v) => s + (v ?? 0), 0);
}
function getPrevMonthValue(c: StablecoinData): number {
  if (!c.circulatingPrevMonth) return 0;
  return Object.values(c.circulatingPrevMonth).reduce((s, v) => s + (v ?? 0), 0);
}

function CardSparkline({ data, color = "#3b82f6" }: { data: Record<string, unknown>[]; color?: string }) {
  if (!Array.isArray(data) || data.length < 2) return null;

  // Take last 30 data points
  const recent = data.slice(-30);
  const values = recent.map((point) => {
    for (const key of ["totalCirculatingUSD", "totalCirculating", "circulating"]) {
      const obj = point[key];
      if (obj && typeof obj === "object") {
        const val = Object.values(obj as Record<string, number>).reduce((s, v) => s + (v ?? 0), 0);
        if (val > 0) return val;
      }
    }
    return 0;
  }).filter((v): v is number => v > 0);

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 2 - ((v - min) / range) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg width={w} height={h} className="mt-1 opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function StablecoinDetailClient({ id }: { id: string }) {
  const { data: detailData, isLoading: detailLoading, isError: detailError } = useStablecoinDetail(id);
  const { data: listData, isLoading: listLoading, isError: listError } = useStablecoins();
  const meta = findStablecoinMeta(id);
  const coinData: StablecoinData | undefined = listData?.peggedAssets?.find(
    (c: StablecoinData) => c.id === id
  );

  const isLoading = detailLoading || listLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (listError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link>
        </Button>
        <p className="text-muted-foreground">Signal lost. Try again shortly.</p>
      </div>
    );
  }

  if (!coinData) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link>
        </Button>
        <p className="text-muted-foreground">This trail leads nowhere.</p>
      </div>
    );
  }

  const circulating = getCirculatingValue(coinData);
  const prevDay = getPrevDayValue(coinData);
  const prevWeek = getPrevWeekValue(coinData);
  const prevMonth = getPrevMonthValue(coinData);
  const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
  const pegRates = derivePegRates(listData?.peggedAssets ?? [], metaById);
  const pegRef = getPegReference(coinData.pegType, pegRates, meta?.goldOunces);

  const chartHistory = detailData?.tokens ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-l-[3px] border-l-blue-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono tracking-tight">{formatPrice(coinData.price)}</div>
            <p className="text-sm text-muted-foreground font-mono">{formatPegDeviation(coinData.price, pegRef)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-l-[3px] border-l-violet-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Market Cap</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono tracking-tight">{formatCurrency(circulating)}</div>
            <p className="text-sm text-muted-foreground">
              {coinData.chains?.length ?? 0} chains
            </p>
            <CardSparkline data={chartHistory} color="#8b5cf6" />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-l-[3px] border-l-emerald-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supply (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono tracking-tight">{formatSupply(circulating)}</div>
            <p className={`text-sm font-mono ${circulating >= prevDay ? "text-green-500" : "text-red-500"}`}>
              {prevDay > 0 ? formatPercentChange(circulating, prevDay) : "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-l-[3px] border-l-amber-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supply Changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">7d</span>
              <span className={`font-mono ${circulating >= prevWeek ? "text-green-500" : "text-red-500"}`}>
                {prevWeek > 0 ? formatPercentChange(circulating, prevWeek) : "N/A"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">30d</span>
              <span className={`font-mono ${circulating >= prevMonth ? "text-green-500" : "text-red-500"}`}>
                {prevMonth > 0 ? formatPercentChange(circulating, prevMonth) : "N/A"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {meta && (meta.collateral || meta.pegMechanism) && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-1">
            <CardTitle><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mechanism</h2></CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {meta.collateral && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Collateral</p>
                <p className="text-sm">{meta.collateral}</p>
              </div>
            )}
            {meta.pegMechanism && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Peg Stability</p>
                <p className="text-sm">{meta.pegMechanism}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <DepegHistory stablecoinId={id} />

      <SupplyChart data={chartHistory} pegType={coinData.pegType} />

      <ChainDistribution coin={coinData} />
    </div>
  );
}
