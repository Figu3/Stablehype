"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ShieldBan } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { useBlacklistEvents } from "@/hooks/use-blacklist-events";
import { useStablecoins } from "@/hooks/use-stablecoins";
import type { BlacklistEvent } from "@/lib/types";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

function computeStats(events: BlacklistEvent[], goldPrices: Record<string, number>) {
  const nowSeconds = Date.now() / 1000;
  const thirtyDaysAgo = nowSeconds - THIRTY_DAYS_SECONDS;

  const addresses = new Map<string, number>();
  let destroyedTotal = 0;
  let recentCount = 0;

  for (const evt of events) {
    const isGold = evt.stablecoin === "PAXG" || evt.stablecoin === "XAUT";

    if (evt.eventType === "blacklist") {
      addresses.set(evt.address, (addresses.get(evt.address) ?? 0) + 1);
    } else if (evt.eventType === "unblacklist") {
      addresses.set(evt.address, (addresses.get(evt.address) ?? 0) - 1);
    } else if (evt.eventType === "destroy" && evt.amount != null) {
      const usdMultiplier = isGold ? (goldPrices[evt.stablecoin] ?? 0) : 1;
      destroyedTotal += evt.amount * usdMultiplier;
    }

    if (evt.timestamp >= thirtyDaysAgo) {
      recentCount++;
    }
  }

  const frozenAddresses = Array.from(addresses.values()).filter((v) => v > 0).length;

  return { frozenAddresses, destroyedTotal, recentCount };
}

export function BlacklistSummary() {
  const { data: events, isLoading } = useBlacklistEvents();
  const { data: stablecoins } = useStablecoins();

  const goldPrices = useMemo(() => {
    const prices: Record<string, number> = {};
    if (!stablecoins) return prices;
    for (const coin of stablecoins.peggedAssets) {
      if (coin.symbol === "PAXG" || coin.symbol === "XAUT") {
        if (typeof coin.price === "number") prices[coin.symbol] = coin.price;
      }
    }
    return prices;
  }, [stablecoins]);

  const stats = useMemo(() => {
    if (!events) return null;
    return computeStats(events, goldPrices);
  }, [events, goldPrices]);

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-l-[3px] border-l-red-500">
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-l-[3px] border-l-red-500">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><ShieldBan className="h-4 w-4" />Blacklist Activity</span>
          <Link
            href="/blacklist"
            className="text-xs font-normal text-muted-foreground hover:text-foreground transition-colors"
          >
            View all events &rarr;
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold font-mono">{stats?.frozenAddresses ?? 0}</p>
            <p className="text-xs text-muted-foreground">frozen addresses</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{stats ? formatCurrency(stats.destroyedTotal) : "$0"}</p>
            <p className="text-xs text-muted-foreground">destroyed value</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{stats?.recentCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">events (30d)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
