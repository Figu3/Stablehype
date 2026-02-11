"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import type { BlacklistEvent } from "@/lib/types";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

function computeStats(events: BlacklistEvent[]) {
  const nowSeconds = Date.now() / 1000;
  const thirtyDaysAgo = nowSeconds - THIRTY_DAYS_SECONDS;

  const usdcAddresses = new Map<string, number>();
  const usdtAddresses = new Map<string, number>();
  const goldAddresses = new Map<string, number>();

  let destroyedTotal = 0;
  let recentCount = 0;

  for (const evt of events) {
    const isGold = evt.stablecoin === "PAXG" || evt.stablecoin === "XAUT";
    const map = isGold
      ? goldAddresses
      : evt.stablecoin === "USDC"
        ? usdcAddresses
        : usdtAddresses;

    if (evt.eventType === "blacklist") {
      map.set(evt.address, (map.get(evt.address) ?? 0) + 1);
    } else if (evt.eventType === "unblacklist") {
      map.set(evt.address, (map.get(evt.address) ?? 0) - 1);
    } else if (evt.eventType === "destroy" && evt.amount != null && !isGold) {
      destroyedTotal += evt.amount;
    }

    if (evt.timestamp >= thirtyDaysAgo) {
      recentCount++;
    }
  }

  const usdcBlacklisted = Array.from(usdcAddresses.values()).filter((v) => v > 0).length;
  const usdtBlacklisted = Array.from(usdtAddresses.values()).filter((v) => v > 0).length;
  const goldBlacklisted = Array.from(goldAddresses.values()).filter((v) => v > 0).length;

  return { usdcBlacklisted, usdtBlacklisted, goldBlacklisted, destroyedTotal, recentCount };
}

interface BlacklistStatsProps {
  events: BlacklistEvent[] | undefined;
  isLoading: boolean;
}

export function BlacklistStats({ events, isLoading }: BlacklistStatsProps) {
  const stats = useMemo(() => {
    if (!events) return null;
    return computeStats(events);
  }, [events]);

  if (isLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="rounded-2xl">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
      <Card className="rounded-2xl border-l-[3px] border-l-blue-500">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">USDC Blacklisted</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold font-mono">{stats?.usdcBlacklisted ?? 0}</p>
          <p className="text-xs text-muted-foreground">unique addresses</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-l-[3px] border-l-cyan-500">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">USDT Blacklisted</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold font-mono">{stats?.usdtBlacklisted ?? 0}</p>
          <p className="text-xs text-muted-foreground">unique addresses</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-l-[3px] border-l-yellow-500">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gold Frozen</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold font-mono">{stats?.goldBlacklisted ?? 0}</p>
          <p className="text-xs text-muted-foreground">PAXG / XAUT addresses</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-l-[3px] border-l-amber-500">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destroyed Funds</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold font-mono">{stats ? formatCurrency(stats.destroyedTotal) : "$0"}</p>
          <p className="text-xs text-muted-foreground">USDT seized total</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-l-[3px] border-l-red-500">
        <CardHeader className="pb-1">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold font-mono">{stats?.recentCount ?? 0}</p>
          <p className="text-xs text-muted-foreground">last 30 days</p>
        </CardContent>
      </Card>
    </div>
  );
}
