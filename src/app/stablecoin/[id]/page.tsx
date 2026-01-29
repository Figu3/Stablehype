"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useStablecoinDetail, useStablecoins } from "@/hooks/use-stablecoins";
import { useLogos } from "@/hooks/use-logos";
import { findStablecoinMeta } from "@/lib/stablecoins";
import { StablecoinLogo } from "@/components/stablecoin-logo";
import { formatCurrency, formatPrice, formatPegDeviation, formatPercentChange, formatSupply } from "@/lib/format";
import { derivePegRates, getPegReference } from "@/lib/peg-rates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PriceChart } from "@/components/price-chart";
import { SupplyChart } from "@/components/supply-chart";
import { ChainDistribution } from "@/components/chain-distribution";
import { FILTER_TAG_LABELS, getFilterTags } from "@/lib/types";
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

export default function StablecoinDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: detailData, isLoading: detailLoading } = useStablecoinDetail(id);
  const { data: listData, isLoading: listLoading } = useStablecoins();
  const { data: logos } = useLogos();

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

  if (!coinData) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link>
        </Button>
        <p className="text-muted-foreground">Stablecoin not found or not tracked.</p>
      </div>
    );
  }

  const circulating = getCirculatingValue(coinData);
  const prevDay = getPrevDayValue(coinData);
  const prevWeek = getPrevWeekValue(coinData);
  const prevMonth = getPrevMonthValue(coinData);
  const tags = meta ? getFilterTags(meta) : [];
  const pegRates = derivePegRates(listData?.peggedAssets ?? []);
  const pegRef = getPegReference(coinData.pegType, pegRates);

  const chartHistory = detailData?.tokens ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StablecoinLogo src={logos?.[coinData.id]} name={coinData.name} size={40} />
        <h1 className="text-3xl font-bold tracking-tight">{coinData.name}</h1>
        <span className="text-xl text-muted-foreground">{coinData.symbol}</span>
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary">{FILTER_TAG_LABELS[tag]}</Badge>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{formatPrice(coinData.price)}</div>
            <p className="text-sm text-muted-foreground">{formatPegDeviation(coinData.price, pegRef)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Market Cap</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(circulating)}</div>
            <p className="text-sm text-muted-foreground">
              {coinData.chains?.length ?? 0} chains
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Supply (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatSupply(circulating)}</div>
            <p className={`text-sm ${circulating >= prevDay ? "text-green-500" : "text-red-500"}`}>
              {prevDay > 0 ? formatPercentChange(circulating, prevDay) : "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Supply Changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">7d</span>
              <span className={circulating >= prevWeek ? "text-green-500" : "text-red-500"}>
                {prevWeek > 0 ? formatPercentChange(circulating, prevWeek) : "N/A"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">30d</span>
              <span className={circulating >= prevMonth ? "text-green-500" : "text-red-500"}>
                {prevMonth > 0 ? formatPercentChange(circulating, prevMonth) : "N/A"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PriceChart data={chartHistory} />
        <SupplyChart data={chartHistory} />
      </div>

      <ChainDistribution coin={coinData} />
    </div>
  );
}
