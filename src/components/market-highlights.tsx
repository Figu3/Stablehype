"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StablecoinLogo } from "@/components/stablecoin-logo";
import { getCirculatingRaw, getPrevWeekRaw } from "@/lib/supply";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import type { StablecoinData } from "@/lib/types";

interface MarketHighlightsProps {
  data: StablecoinData[] | undefined;
  logos?: Record<string, string>;
}

export function MarketHighlights({ data, logos }: MarketHighlightsProps) {
  const { growers, shrinkers } = useMemo(() => {
    if (!data) return { growers: [], shrinkers: [] };

    const metaIds = new Set(TRACKED_STABLECOINS.map((s) => s.id));
    const entries: {
      id: string;
      symbol: string;
      name: string;
      pctChange: number;
    }[] = [];

    for (const coin of data) {
      if (!metaIds.has(coin.id)) continue;
      const current = getCirculatingRaw(coin);
      const prev = getPrevWeekRaw(coin);
      if (current < 1_000_000 || prev < 1_000_000) continue;

      const pctChange = ((current - prev) / prev) * 100;
      entries.push({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        pctChange,
      });
    }

    const sorted = [...entries].sort((a, b) => b.pctChange - a.pctChange);
    return {
      growers: sorted.slice(0, 3),
      shrinkers: sorted.slice(-3).reverse().filter((e) => e.pctChange < 0),
    };
  }, [data]);

  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-3 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, j) => (
            <Skeleton key={j} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-[3px] border-l-emerald-500">
      <CardHeader className="pb-2">
        <CardTitle as="h2" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Fastest Movers <span className="normal-case font-normal text-muted-foreground">(7d supply change)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4">
          {/* Growing */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Growing</p>
            {growers.map((g) => (
              <Link
                key={g.id}
                href={`/stablecoin/${g.id}`}
                className="flex items-center justify-between gap-1 group"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <StablecoinLogo
                    src={logos?.[g.id]}
                    name={g.name}
                    size={18}
                  />
                  <span className="text-sm font-medium truncate group-hover:underline">
                    {g.symbol}
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-500 flex-shrink-0">
                  +{g.pctChange.toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
          {/* Shrinking */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">Shrinking</p>
            {shrinkers.length === 0 && (
              <p className="text-xs text-muted-foreground">None</p>
            )}
            {shrinkers.map((s) => (
              <Link
                key={s.id}
                href={`/stablecoin/${s.id}`}
                className="flex items-center justify-between gap-1 group"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <StablecoinLogo
                    src={logos?.[s.id]}
                    name={s.name}
                    size={18}
                  />
                  <span className="text-sm font-medium truncate group-hover:underline">
                    {s.symbol}
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold text-red-500 flex-shrink-0">
                  {s.pctChange.toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
