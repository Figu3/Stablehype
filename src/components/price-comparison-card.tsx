"use client";

import { useMemo } from "react";
import { usePriceSources } from "@/hooks/use-price-sources";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PriceSourceEntry } from "@/lib/types";

interface PriceComparisonCardProps {
  stablecoinId: string;
  pegReference?: number;
}

// Category metadata
const CATEGORY_META: Record<string, { label: string; color: string; dotClass: string; bgClass: string }> = {
  dex: { label: "DEX", color: "#3b82f6", dotClass: "bg-blue-500", bgClass: "bg-blue-500/10 text-blue-500" },
  oracle: { label: "Oracle", color: "#10b981", dotClass: "bg-emerald-500", bgClass: "bg-emerald-500/10 text-emerald-500" },
  cex: { label: "CEX", color: "#8b5cf6", dotClass: "bg-violet-500", bgClass: "bg-violet-500/10 text-violet-500" },
};

// Clear oracle = our central peg reference → red to distinguish from generic oracles
const CLEAR_META = { label: "Clear", dotClass: "bg-red-500", bgClass: "bg-red-500/10 text-red-500" };

function isClear(entry: { name: string }): boolean {
  return entry.name.toLowerCase() === "clear";
}

function deviationBps(price: number, peg: number): number {
  if (peg === 0) return 0;
  return Math.round(((price - peg) / peg) * 10000);
}

function formatBps(bps: number): string {
  const sign = bps >= 0 ? "+" : "";
  return `${sign}${bps} bps`;
}

function spreadColor(spreadBps: number): string {
  if (spreadBps < 10) return "text-emerald-500";
  if (spreadBps < 50) return "text-amber-500";
  return "text-red-500";
}

function spreadBgColor(spreadBps: number): string {
  if (spreadBps < 10) return "bg-emerald-500/10 text-emerald-500";
  if (spreadBps < 50) return "bg-amber-500/10 text-amber-500";
  return "bg-red-500/10 text-red-500";
}

export function PriceComparisonCard({ stablecoinId, pegReference = 1 }: PriceComparisonCardProps) {
  const { data, isLoading } = usePriceSources(stablecoinId);

  const analysis = useMemo(() => {
    if (!data?.sources) return null;

    const allSources: (PriceSourceEntry & { category: string })[] = [];
    for (const [cat, entries] of Object.entries(data.sources)) {
      for (const entry of entries) {
        allSources.push({ ...entry, category: cat });
      }
    }

    if (allSources.length === 0) return null;

    const prices = allSources.map((s) => s.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    // Spread = distance between max and min prices, expressed in bps relative to peg
    const spreadBps = pegReference > 0
      ? Math.round(((maxPrice - minPrice) / pegReference) * 10000)
      : 0;

    // Confidence-weighted average
    const totalConf = allSources.reduce((sum, s) => sum + s.confidence, 0);
    const consensus = totalConf > 0
      ? allSources.reduce((sum, s) => sum + s.price * s.confidence, 0) / totalConf
      : allSources.reduce((sum, s) => sum + s.price, 0) / allSources.length;

    // Compute strip range: center on peg reference, extend to cover all prices with padding
    const padding = Math.max(0.0005, (maxPrice - minPrice) * 0.3);
    const rangeMin = Math.min(minPrice, pegReference) - padding;
    const rangeMax = Math.max(maxPrice, pegReference) + padding;

    // Categories that have data
    const activeCategories = (["dex", "oracle", "cex"] as const).filter(
      (cat) => (data.sources[cat] ?? []).length > 0
    );

    return {
      allSources,
      minPrice,
      maxPrice,
      spreadBps: Math.abs(spreadBps),
      consensus,
      rangeMin,
      rangeMax,
      activeCategories,
    };
  }, [data, pegReference]);

  if (isLoading) {
    return <Skeleton className="h-48 rounded-2xl" />;
  }

  if (!analysis) return null;

  const { allSources, spreadBps, consensus, rangeMin, rangeMax, activeCategories } = analysis;

  // Positioning helper: map a price to percentage position on the strip
  const priceToPercent = (price: number): number => {
    const range = rangeMax - rangeMin;
    if (range === 0) return 50;
    return ((price - rangeMin) / range) * 100;
  };

  const pegPercent = priceToPercent(pegReference);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Price Sources
          <span className="ml-2 font-mono text-[10px] text-muted-foreground/70 normal-case tracking-normal">
            {allSources.length} sources across {activeCategories.length} categories
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Price strip visualization */}
        <div className="space-y-1">
          {activeCategories.map((cat) => {
            const meta = CATEGORY_META[cat];
            const entries = data?.sources[cat] ?? [];
            return (
              <div key={cat} className="flex items-center gap-3">
                {/* Category label */}
                <div className="w-14 flex-shrink-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.bgClass}`}>
                    {meta.label}
                  </span>
                </div>

                {/* Strip */}
                <div className="relative flex-1 h-8">
                  {/* Track background */}
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-border rounded-full" />

                  {/* Peg reference line — dashed, bright amber for visibility */}
                  <div
                    className="absolute top-0 bottom-0 w-px border-l-2 border-dashed border-amber-400 dark:border-amber-500"
                    style={{ left: `${pegPercent}%` }}
                  />

                  {/* Source dots */}
                  {entries.map((entry, i) => {
                    const pct = priceToPercent(entry.price);
                    const bps = deviationBps(entry.price, pegReference);
                    // Size proportional to confidence (6px to 14px)
                    const size = 6 + Math.round(entry.confidence * 8);
                    return (
                      <div
                        key={`${cat}-${i}`}
                        className="absolute top-1/2 group"
                        style={{
                          left: `${pct}%`,
                          transform: `translate(-50%, -50%)`,
                        }}
                      >
                        <div
                          className={`rounded-full ${isClear(entry) ? CLEAR_META.dotClass : meta.dotClass} ring-2 ring-background cursor-default transition-transform hover:scale-150`}
                          style={{ width: `${size}px`, height: `${size}px` }}
                        />
                        {/* Tooltip — clamp horizontal position to avoid clipping at strip edges */}
                        <div
                          className="absolute bottom-full mb-2 hidden group-hover:block z-50"
                          style={{
                            left: pct < 20 ? "0%" : pct > 80 ? "100%" : "50%",
                            transform: pct < 20 ? "translateX(0%)" : pct > 80 ? "translateX(-100%)" : "translateX(-50%)",
                          }}
                        >
                          <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg whitespace-nowrap">
                            <p className="font-semibold">{entry.name}</p>
                            <p className="font-mono">${entry.price.toFixed(4)}</p>
                            <p className={`font-mono ${bps >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {formatBps(bps)}
                            </p>
                            {entry.tvl != null && (
                              <p className="text-muted-foreground">TVL: ${(entry.tvl / 1e6).toFixed(1)}M</p>
                            )}
                            {entry.volume24h != null && (
                              <p className="text-muted-foreground">Vol: ${(entry.volume24h / 1e6).toFixed(1)}M</p>
                            )}
                            {entry.pair != null && (
                              <p className="text-muted-foreground">{entry.pair}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Axis labels */}
        <div className="flex items-center gap-3">
          <div className="w-14 flex-shrink-0" />
          <div className="relative flex-1 h-5">
            <span className="absolute left-0 text-[10px] font-mono text-muted-foreground">
              ${rangeMin.toFixed(4)}
            </span>
            <span
              className="absolute -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${pegPercent}%` }}
            >
              <span className="text-[10px] font-semibold font-mono text-amber-600 dark:text-amber-400">
                PEG ${pegReference.toFixed(4)}
              </span>
            </span>
            <span className="absolute right-0 text-[10px] font-mono text-muted-foreground">
              ${rangeMax.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Spread:</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold font-mono ${spreadBgColor(spreadBps)}`}>
              {spreadBps.toFixed(1)} bps
            </span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Consensus:</span>
            <span className="text-xs font-bold font-mono">${consensus.toFixed(4)}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">vs peg:</span>
            <span className={`text-xs font-bold font-mono ${spreadColor(Math.abs(deviationBps(consensus, pegReference)))}`}>
              {formatBps(deviationBps(consensus, pegReference))}
            </span>
          </div>
        </div>

        {/* Venue table — always visible */}
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Source</th>
                <th className="px-3 py-1.5 text-center text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">Price</th>
                <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">vs Peg</th>
                <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">TVL / Vol</th>
              </tr>
            </thead>
            <tbody>
              {[...allSources]
                .sort((a, b) => b.confidence - a.confidence)
                .map((src, i) => {
                  const catMeta = CATEGORY_META[src.category];
                  const bps = deviationBps(src.price, pegReference);
                  return (
                    <tr key={`venue-${i}`} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${isClear(src) ? CLEAR_META.dotClass : catMeta.dotClass}`} />
                          <span className="font-medium text-xs">{src.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${isClear(src) ? CLEAR_META.bgClass : catMeta.bgClass}`}>
                          {isClear(src) ? CLEAR_META.label : catMeta.label}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs">${src.price.toFixed(4)}</td>
                      <td className={`px-3 py-1.5 text-right font-mono tabular-nums text-xs ${bps >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {formatBps(bps)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-muted-foreground hidden sm:table-cell">
                        {src.tvl != null && <span>${(src.tvl / 1e6).toFixed(1)}M</span>}
                        {src.tvl != null && src.volume24h != null && <span className="mx-1">/</span>}
                        {src.volume24h != null && <span>${(src.volume24h / 1e6).toFixed(1)}M</span>}
                        {src.pair != null && !src.tvl && !src.volume24h && <span>{src.pair}</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
