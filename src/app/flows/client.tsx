"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StablecoinLogo } from "@/components/stablecoin-logo";
import { useFlows, type FlowCoin } from "@/hooks/use-flows";
import { useLogos } from "@/hooks/use-logos";
import { useClearMode } from "@/components/clear-mode-context";
import { CLEAR_ORACLE_IDS } from "@shared/lib/stablecoins";
import { formatCurrency } from "@/lib/format";
import type { GaugeBand } from "@shared/lib/flows-scoring";

const GAUGE_BAND_META: Record<GaugeBand, { label: string; className: string }> = {
  "redemption-stress": {
    label: "Redemption Stress",
    className: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  neutral: {
    label: "Neutral",
    className: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  "issuance-strength": {
    label: "Issuance Strength",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
};

function flowClass(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v > 0) return "text-emerald-700 dark:text-emerald-400";
  if (v < 0) return "text-red-700 dark:text-red-400";
  return "text-muted-foreground";
}

function signedCurrency(v: number | null): string {
  if (v == null) return "—";
  const s = formatCurrency(v);
  return v > 0 ? `+${s}` : s;
}

function signedPct(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function pressureBadge(score: number | null) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  let cls = "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400";
  if (score <= -50) cls = "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400";
  else if (score <= -15) cls = "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  else if (score >= 15) cls = "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  return (
    <Badge variant="outline" className={`font-mono tabular-nums ${cls}`}>
      {score > 0 ? `+${score}` : score}
    </Badge>
  );
}

type SortKey = "supply" | "flow24h" | "flow7d" | "flow30d" | "pressure";

interface SortConfig {
  key: SortKey;
  direction: "asc" | "desc";
}

function sortValue(c: FlowCoin, key: SortKey): number | null {
  switch (key) {
    case "supply": return c.supplyUsd;
    case "flow24h": return c.flow24hUsd;
    case "flow7d": return c.flow7dUsd;
    case "flow30d": return c.flow30dUsd;
    case "pressure": return c.pressureScore;
  }
}

function SortIcon({ columnKey, sort }: { columnKey: SortKey; sort: SortConfig }) {
  if (sort.key !== columnKey) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />;
  return sort.direction === "asc" ? (
    <ArrowUp className="ml-1 inline h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 inline h-3 w-3" />
  );
}

export default function FlowsClient() {
  const { data, isLoading, error } = useFlows();
  const { data: logos } = useLogos();
  const { clearMode } = useClearMode();
  const [sort, setSort] = useState<SortConfig>({ key: "flow24h", direction: "desc" });

  const coins = useMemo(() => {
    let list = data?.coins ?? [];
    if (clearMode) list = list.filter((c) => CLEAR_ORACLE_IDS.has(c.id));
    return [...list].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      // Nulls always last
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sort.direction === "asc" ? av - bv : bv - av;
    });
  }, [data, clearMode, sort]);

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" }
    );
  };

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
        Failed to load flow data. Please try again later.
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const { summary } = data;
  const bandMeta = summary.band ? GAUGE_BAND_META[summary.band] : null;

  return (
    <div className="space-y-6">
      {/* ── Gauge + 24h totals ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bank-Run Gauge
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold font-mono tabular-nums">
                {summary.gauge != null ? (summary.gauge > 0 ? `+${summary.gauge}` : summary.gauge) : "—"}
              </span>
              {bandMeta && (
                <Badge variant="outline" className={bandMeta.className}>
                  {bandMeta.label}
                </Badge>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Market-cap-weighted issuance pressure vs each coin&apos;s 30-day
              baseline. Below −10 = redemption stress; above +10 = issuance
              strength.{" "}
              <Link href="/methodology/supply-flows/" className="underline hover:text-foreground">
                Methodology
              </Link>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              24h Minted / Burned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 font-mono tabular-nums">
              <p className="text-lg text-emerald-700 dark:text-emerald-400">
                +{formatCurrency(summary.mint24hUsd)}
              </p>
              <p className="text-lg text-red-700 dark:text-red-400">
                −{formatCurrency(summary.burn24hUsd)}
              </p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Net {signedCurrency(summary.net24hUsd)} across{" "}
              {summary.coinsIncluded} coins · 7d {signedCurrency(summary.net7dUsd)} · 30d{" "}
              {signedCurrency(summary.net30dUsd)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Top Movers (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {summary.topMint24h.slice(0, 3).map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <Link href={`/stablecoin/${c.id}/`} className="font-medium hover:underline">
                  {c.symbol}
                </Link>
                <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  +{formatCurrency(c.flow24hUsd)}
                </span>
              </div>
            ))}
            {summary.topBurn24h.slice(0, 3).map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <Link href={`/stablecoin/${c.id}/`} className="font-medium hover:underline">
                  {c.symbol}
                </Link>
                <span className="font-mono tabular-nums text-red-700 dark:text-red-400">
                  {formatCurrency(c.flow24hUsd)}
                </span>
              </div>
            ))}
            {summary.topMint24h.length === 0 && summary.topBurn24h.length === 0 && (
              <p className="text-sm text-muted-foreground">No significant flows today.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Flows table ── */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-medium"
                onClick={() => handleSort("supply")}
              >
                Supply
                <SortIcon columnKey="supply" sort={sort} />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-medium"
                onClick={() => handleSort("flow24h")}
              >
                24h Flow
                <SortIcon columnKey="flow24h" sort={sort} />
              </th>
              <th
                className="hidden cursor-pointer select-none px-4 py-3 text-right font-medium sm:table-cell"
                onClick={() => handleSort("flow7d")}
              >
                7d Flow
                <SortIcon columnKey="flow7d" sort={sort} />
              </th>
              <th
                className="hidden cursor-pointer select-none px-4 py-3 text-right font-medium sm:table-cell"
                onClick={() => handleSort("flow30d")}
              >
                30d Flow
                <SortIcon columnKey="flow30d" sort={sort} />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-medium"
                onClick={() => handleSort("pressure")}
              >
                Pressure
                <SortIcon columnKey="pressure" sort={sort} />
              </th>
            </tr>
          </thead>
          <tbody className="table-striped">
            {coins.map((c, i) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-accent/40 transition-colors">
                <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link href={`/stablecoin/${c.id}/`} className="flex items-center gap-2.5 hover:underline">
                    <StablecoinLogo src={logos?.[c.id]} name={c.name} size={22} />
                    <span className="font-medium">{c.symbol}</span>
                    <span className="hidden text-xs text-muted-foreground md:inline">{c.name}</span>
                    {c.navToken && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        NAV
                      </Badge>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatCurrency(c.supplyUsd)}
                </td>
                <td className={`px-4 py-3 text-right font-mono tabular-nums ${flowClass(c.flow24hUsd)}`}>
                  <div>{signedCurrency(c.flow24hUsd)}</div>
                  <div className="text-[11px] opacity-70">{signedPct(c.pct24h)}</div>
                </td>
                <td className={`hidden px-4 py-3 text-right font-mono tabular-nums sm:table-cell ${flowClass(c.flow7dUsd)}`}>
                  <div>{signedCurrency(c.flow7dUsd)}</div>
                  <div className="text-[11px] opacity-70">{signedPct(c.pct7d)}</div>
                </td>
                <td className={`hidden px-4 py-3 text-right font-mono tabular-nums sm:table-cell ${flowClass(c.flow30dUsd)}`}>
                  <div>{signedCurrency(c.flow30dUsd)}</div>
                  <div className="text-[11px] opacity-70">{signedPct(c.pct30d)}</div>
                </td>
                <td className="px-4 py-3 text-right">{pressureBadge(c.pressureScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Flows derive from DefiLlama circulating-supply snapshots (current vs 24h/7d/30d ago), FX-converted
        to USD. Pressure compares today&apos;s net flow to the coin&apos;s own 30-day average daily flow,
        normalized by supply; ±4% of supply per day saturates at ±100. Coins under $1M supply are excluded.
      </p>
    </div>
  );
}
