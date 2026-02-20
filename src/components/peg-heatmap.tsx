"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StablecoinLogo } from "@/components/stablecoin-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import type { PegSummaryCoin, PegCurrency, RedemptionType } from "@/lib/types";

interface PegHeatmapProps {
  coins: PegSummaryCoin[];
  logos?: Record<string, string>;
  isLoading: boolean;
  pegFilter: PegCurrency | "all";
  redemptionFilter: RedemptionType | "all";
  chainFilter: string;
  chainOptions: string[];
  onPegFilterChange: (v: PegCurrency | "all") => void;
  onRedemptionFilterChange: (v: RedemptionType | "all") => void;
  onChainFilterChange: (v: string) => void;
  searchQuery?: string;
  onSearchChange?: (v: string) => void;
}

const PEG_OPTIONS: { value: PegCurrency | "all"; label: string }[] = [
  { value: "all", label: "All Pegs" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

const REDEMPTION_OPTIONS: { value: RedemptionType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "direct", label: "Direct" },
  { value: "cdp", label: "CDP" },
  { value: "psm", label: "PSM" },
  { value: "secondary-only", label: "Secondary" },
];

function deviationColor(absBps: number): string {
  // Severe depeg (≥100bps / 1%)
  if (absBps >= 100) return "bg-red-600/20 border-red-600/50 text-red-600 dark:text-red-400";
  // Significant (50–99bps)
  if (absBps >= 50) return "bg-red-500/15 border-red-500/40 text-red-500 dark:text-red-400";
  // Moderate (20–49bps)
  if (absBps >= 20) return "bg-orange-500/15 border-orange-500/40 text-orange-600 dark:text-orange-400";
  // Mild (5–19bps) — at/above depeg threshold
  if (absBps >= 5) return "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400";
  // Tight peg (<5bps)
  return "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400";
}

function FilterSelect<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={label}
      className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function PegHeatmap({
  coins,
  logos,
  isLoading,
  pegFilter,
  redemptionFilter,
  chainFilter,
  chainOptions,
  onPegFilterChange,
  onRedemptionFilterChange,
  onChainFilterChange,
  searchQuery,
  onSearchChange,
}: PegHeatmapProps) {
  const sorted = useMemo(() => {
    return [...coins]
      .filter((c) => c.currentDeviationBps !== null)
      .sort((a, b) => Math.abs(b.currentDeviationBps!) - Math.abs(a.currentDeviationBps!));
  }, [coins]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle as="h2" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Live Peg Deviation
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect options={PEG_OPTIONS} value={pegFilter} onChange={onPegFilterChange} label="Filter by peg type" />
            <FilterSelect options={REDEMPTION_OPTIONS} value={redemptionFilter} onChange={onRedemptionFilterChange} label="Filter by redemption type" />
            <FilterSelect
              options={[
                { value: "all" as const, label: "All Chains" },
                ...chainOptions.map((ch) => ({ value: ch, label: ch })),
              ]}
              value={chainFilter}
              onChange={onChainFilterChange}
              label="Filter by chain"
            />
            {onSearchChange && (
              <div className="relative w-full sm:w-44">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery ?? ""}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-8 h-8 text-xs"
                  aria-label="Search stablecoins by name or symbol"
                />
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {Array.from({ length: 30 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No coins match filters</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {sorted.map((coin) => {
              const absBps = Math.abs(coin.currentDeviationBps!);
              const sign = coin.currentDeviationBps! >= 0 ? "+" : "";
              const dex = coin.dexPriceCheck;
              const dexDisagrees = dex && !dex.agrees;
              return (
                <Link
                  key={coin.id}
                  href={`/stablecoin/${coin.id}`}
                  className={`relative flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-transform hover:scale-105 ${deviationColor(absBps)}`}
                  title={dexDisagrees
                    ? `DEX price disagrees: $${dex.dexPrice.toFixed(4)} (${dex.dexDeviationBps >= 0 ? "+" : ""}${dex.dexDeviationBps}bps) from ${dex.sourcePools} pool${dex.sourcePools !== 1 ? "s" : ""} (${formatCurrency(dex.sourceTvl)} TVL)`
                    : undefined}
                >
                  {dexDisagrees && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white" aria-label="DEX price disagrees">!</span>
                  )}
                  <StablecoinLogo src={logos?.[coin.id]} name={coin.name} size={20} />
                  <span className="text-[10px] font-medium truncate max-w-full">{coin.symbol}</span>
                  <span className="text-[10px] font-mono font-semibold">
                    {sign}{coin.currentDeviationBps}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
