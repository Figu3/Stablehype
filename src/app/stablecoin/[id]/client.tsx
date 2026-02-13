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
import type { StablecoinData, StablecoinMeta } from "@/lib/types";

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

// --- Category colors (matching main page badges) ---

const GOVERNANCE_STYLE: Record<string, { label: string; cls: string }> = {
  centralized: { label: "Centralized", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  "centralized-dependent": { label: "CeFi-Dependent", cls: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  decentralized: { label: "Decentralized", cls: "bg-green-500/10 text-green-500 border-green-500/20" },
};

const BACKING_STYLE: Record<string, { label: string; cls: string }> = {
  "rwa-backed": { label: "RWA-Backed", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  "crypto-backed": { label: "Crypto-Backed", cls: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  algorithmic: { label: "Algorithmic", cls: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
};

const PEG_STYLE: Record<string, { label: string; cls: string }> = {
  USD: { label: "USD Peg", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  EUR: { label: "EUR Peg", cls: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  GOLD: { label: "Gold Peg", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  CHF: { label: "CHF Peg", cls: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  GBP: { label: "GBP Peg", cls: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
  BRL: { label: "BRL Peg", cls: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  RUB: { label: "RUB Peg", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
  VAR: { label: "Variable Peg", cls: "bg-sky-500/10 text-sky-500 border-sky-500/20" },
  OTHER: { label: "Other Peg", cls: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
};

function MechanismCard({ meta }: { meta: StablecoinMeta }) {
  const gov = GOVERNANCE_STYLE[meta.flags.governance];
  const backing = BACKING_STYLE[meta.flags.backing];
  const peg = PEG_STYLE[meta.flags.pegCurrency];
  const hasDescription = meta.collateral || meta.pegMechanism;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classification & Mechanism</h2></CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {gov && <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${gov.cls}`}>{gov.label}</span>}
          {backing && <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${backing.cls}`}>{backing.label}</span>}
          {peg && <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${peg.cls}`}>{peg.label}</span>}
          {meta.flags.yieldBearing && <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Yield-Bearing</span>}
          {meta.flags.rwa && <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-sky-500/10 text-sky-500 border-sky-500/20">RWA</span>}
        </div>

        {hasDescription && (
          <div className="grid gap-4 sm:grid-cols-2">
            {meta.collateral && (
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Collateral</p>
                <p className="text-sm leading-relaxed">{meta.collateral}</p>
              </div>
            )}
            {meta.pegMechanism && (
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Peg Stability</p>
                <p className="text-sm leading-relaxed">{meta.pegMechanism}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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

      <SupplyChart data={chartHistory} pegType={coinData.pegType} />

      {meta && (
        <MechanismCard meta={meta} />
      )}

      <DepegHistory stablecoinId={id} />

      <ChainDistribution coin={coinData} />
    </div>
  );
}
