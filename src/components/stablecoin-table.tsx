"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatCurrency, formatNativePrice, formatPegDeviation, formatPercentChange } from "@/lib/format";
import { getPegReference } from "@/lib/peg-rates";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import type { StablecoinData, FilterTag, SortConfig, PegSummaryCoin, BluechipRating } from "@/lib/types";
import { getFilterTags } from "@/lib/types";
import { GRADE_ORDER, BLUECHIP_REPORT_BASE } from "@/lib/bluechip";
import { StablecoinLogo } from "@/components/stablecoin-logo";

const PAGE_SIZE = 25;

const GRADE_COLORS: Record<string, string> = {
  "A+": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  A: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "A-": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "B+": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  B: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "B-": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "C+": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  C: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "C-": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  D: "bg-red-500/10 text-red-500 border-red-500/20",
  F: "bg-red-500/10 text-red-500 border-red-500/20",
};

interface StablecoinTableProps {
  data: StablecoinData[] | undefined;
  isLoading: boolean;
  activeFilters: FilterTag[];
  logos?: Record<string, string>;
  pegRates?: Record<string, number>;
  searchQuery?: string;
  pegScores?: Map<string, PegSummaryCoin>;
  bluechipRatings?: Record<string, BluechipRating>;
}

function toUSD(bucket: Record<string, number | null> | undefined, rates: Record<string, number>): number {
  if (!bucket) return 0;
  return Object.entries(bucket).reduce((s, [peg, v]) => {
    // Gold values are already in USD (CoinGecko mcap), skip rate conversion
    const rate = peg === "peggedGOLD" ? 1 : (rates[peg] ?? 1);
    return s + (v ?? 0) * rate;
  }, 0);
}

function getCirculating(coin: StablecoinData, rates: Record<string, number>): number {
  return toUSD(coin.circulating, rates);
}

function getPrevDay(coin: StablecoinData, rates: Record<string, number>): number {
  return toUSD(coin.circulatingPrevDay, rates);
}

function getPrevWeek(coin: StablecoinData, rates: Record<string, number>): number {
  return toUSD(coin.circulatingPrevWeek, rates);
}

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2 || values.every(v => v === 0)) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const h = 16;
  const w = 40;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const trending = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} className="inline-block align-middle mr-1">
      <polyline points={points} fill="none" stroke={trending ? "#22c55e" : "#ef4444"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BACKING_COLORS: Record<string, string> = {
  "rwa-backed": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "crypto-backed": "bg-purple-500/10 text-purple-500 border-purple-500/20",
  algorithmic: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

const GOVERNANCE_COLORS: Record<string, string> = {
  centralized: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  "centralized-dependent": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  decentralized: "bg-green-500/10 text-green-500 border-green-500/20",
};

function SortIcon({ columnKey, sort }: { columnKey: string; sort: SortConfig }) {
  if (sort.key !== columnKey) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />;
  return sort.direction === "asc" ? (
    <ArrowUp className="ml-1 inline h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 inline h-3 w-3" />
  );
}

export function StablecoinTable({ data, isLoading, activeFilters, logos, pegRates = {}, searchQuery, pegScores, bluechipRatings }: StablecoinTableProps) {
  const [sort, setSort] = useState<SortConfig>({ key: "mcap", direction: "desc" });
  const [page, setPage] = useState(0);
  const router = useRouter();

  const trackedIds = useMemo(() => {
    if (activeFilters.length === 0) {
      return new Set(TRACKED_STABLECOINS.map((s) => s.id));
    }
    return new Set(
      TRACKED_STABLECOINS.filter((s) => {
        const tags = getFilterTags(s);
        return activeFilters.every((f) => tags.includes(f));
      }).map((s) => s.id)
    );
  }, [activeFilters]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = searchQuery?.toLowerCase().trim() ?? "";
    return data.filter((coin) => {
      if (!trackedIds.has(coin.id)) return false;
      if (q && !coin.name.toLowerCase().includes(q) && !coin.symbol.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, trackedIds, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sort.key) {
        case "name":
          return sort.direction === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        case "price":
          aVal = a.price ?? 0;
          bVal = b.price ?? 0;
          break;
        case "mcap":
          aVal = getCirculating(a, pegRates);
          bVal = getCirculating(b, pegRates);
          break;
        case "change24h": {
          const aPrev24 = getPrevDay(a, pegRates);
          const bPrev24 = getPrevDay(b, pegRates);
          aVal = aPrev24 > 0 ? (getCirculating(a, pegRates) - aPrev24) / aPrev24 : 0;
          bVal = bPrev24 > 0 ? (getCirculating(b, pegRates) - bPrev24) / bPrev24 : 0;
          break;
        }
        case "change7d": {
          const aPrev7 = getPrevWeek(a, pegRates);
          const bPrev7 = getPrevWeek(b, pegRates);
          aVal = aPrev7 > 0 ? (getCirculating(a, pegRates) - aPrev7) / aPrev7 : 0;
          bVal = bPrev7 > 0 ? (getCirculating(b, pegRates) - bPrev7) / bPrev7 : 0;
          break;
        }
        case "stability": {
          const aScore = pegScores?.get(a.id)?.pegScore ?? null;
          const bScore = pegScores?.get(b.id)?.pegScore ?? null;
          // NAV tokens / null scores sort last regardless of direction
          if (aScore === null && bScore === null) return 0;
          if (aScore === null) return 1;
          if (bScore === null) return -1;
          aVal = aScore;
          bVal = bScore;
          break;
        }
        case "safety": {
          const aGrade = bluechipRatings?.[a.id]?.grade;
          const bGrade = bluechipRatings?.[b.id]?.grade;
          const aOrder = aGrade ? (GRADE_ORDER[aGrade] ?? 0) : -1;
          const bOrder = bGrade ? (GRADE_ORDER[bGrade] ?? 0) : -1;
          // Unrated coins sort to bottom regardless of direction
          if (aOrder === -1 && bOrder === -1) return 0;
          if (aOrder === -1) return 1;
          if (bOrder === -1) return -1;
          aVal = aOrder;
          bVal = bOrder;
          break;
        }
        default:
          aVal = getCirculating(a, pegRates);
          bVal = getCirculating(b, pegRates);
      }
      return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [filtered, sort, pegRates, pegScores, bluechipRatings]);

  // Reset page when filters, search, or sort change (adjusting state during render)
  const [prev, setPrev] = useState({ filtered, sort });
  if (prev.filtered !== filtered || prev.sort !== sort) {
    setPrev({ filtered, sort });
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rangeStart = sorted.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, sorted.length);

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" }
    );
  }

  function getAriaSortValue(columnKey: string): "ascending" | "descending" | "none" {
    if (sort.key !== columnKey) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  function handleSortKeyDown(e: React.KeyboardEvent, key: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleSort(key);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border overflow-hidden">
        <div className="bg-muted/50 h-10" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-t">
            <Skeleton className="h-4 w-8 shrink-0" />
            <Skeleton className="h-6 w-6 rounded-full shrink-0" />
            <Skeleton className="h-4 w-28" />
            <div className="flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12 hidden sm:block" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14 hidden sm:block" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-x-auto table-header-sticky table-striped" aria-live="polite">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-[50px] text-right">#</TableHead>
            <TableHead
              className="w-[200px] cursor-pointer"
              onClick={() => toggleSort("name")}
              aria-sort={getAriaSortValue("name")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleSortKeyDown(e, "name")}
            >
              Name <SortIcon columnKey="name" sort={sort} />
            </TableHead>
            <TableHead
              className="cursor-pointer text-right"
              onClick={() => toggleSort("price")}
              aria-sort={getAriaSortValue("price")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleSortKeyDown(e, "price")}
            >
              Price <SortIcon columnKey="price" sort={sort} />
            </TableHead>
            <TableHead className="text-right">Peg</TableHead>
            <TableHead
              className="cursor-pointer text-right"
              onClick={() => toggleSort("mcap")}
              aria-sort={getAriaSortValue("mcap")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleSortKeyDown(e, "mcap")}
            >
              Market Cap <SortIcon columnKey="mcap" sort={sort} />
            </TableHead>
            <TableHead
              className="cursor-pointer text-right"
              onClick={() => toggleSort("change24h")}
              aria-sort={getAriaSortValue("change24h")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleSortKeyDown(e, "change24h")}
            >
              24h <SortIcon columnKey="change24h" sort={sort} />
            </TableHead>
            <TableHead
              className="hidden sm:table-cell cursor-pointer text-right"
              onClick={() => toggleSort("change7d")}
              aria-sort={getAriaSortValue("change7d")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleSortKeyDown(e, "change7d")}
            >
              7d <SortIcon columnKey="change7d" sort={sort} />
            </TableHead>
            <TableHead
              className="hidden sm:table-cell cursor-pointer text-right"
              onClick={() => toggleSort("stability")}
              aria-sort={getAriaSortValue("stability")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleSortKeyDown(e, "stability")}
            >
              Peg Score <SortIcon columnKey="stability" sort={sort} />
            </TableHead>
            <TableHead
              className="hidden sm:table-cell cursor-pointer text-center"
              onClick={() => toggleSort("safety")}
              aria-sort={getAriaSortValue("safety")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleSortKeyDown(e, "safety")}
            >
              Safety <SortIcon columnKey="safety" sort={sort} />
            </TableHead>
            <TableHead className="hidden md:table-cell text-center">Backing</TableHead>
            <TableHead className="hidden md:table-cell text-center">Type</TableHead>
            <TableHead className="hidden md:table-cell text-center">Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginated.map((coin, index) => {
            const circulating = getCirculating(coin, pegRates);
            const prevDay = getPrevDay(coin, pegRates);
            const prevWeek = getPrevWeek(coin, pegRates);
            const meta = TRACKED_STABLECOINS.find((s) => s.id === coin.id);
            const change24h = prevDay > 0 ? ((circulating - prevDay) / prevDay) * 100 : 0;
            const change7d = prevWeek > 0 ? ((circulating - prevWeek) / prevWeek) * 100 : 0;

            return (
              <TableRow
                key={coin.id}
                className="hover:bg-muted/70 cursor-pointer"
                onClick={() => router.push(`/stablecoin/${coin.id}`)}
              >
                <TableCell className="text-right text-muted-foreground text-xs tabular-nums">
                  {page * PAGE_SIZE + index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/stablecoin/${coin.id}`}
                    className="flex items-center gap-2 font-medium hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <StablecoinLogo src={logos?.[coin.id]} name={coin.name} size={24} />
                    <span>{coin.name}</span>
                    <span className="text-xs text-muted-foreground">{coin.symbol}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {(() => {
                    const ref = getPegReference(coin.pegType, pegRates, meta?.goldOunces);
                    return formatNativePrice(coin.price, meta?.flags.pegCurrency ?? "USD", ref);
                  })()}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {meta?.flags.navToken ? (
                    <span className="text-muted-foreground" title={meta.flags.pegCurrency === "VAR" ? "CPI-indexed — price tracks inflation" : "NAV token — price appreciates with yield"}>
                      {meta.flags.pegCurrency === "VAR" ? "CPI" : "NAV"}
                    </span>
                  ) : (() => {
                    const ref = getPegReference(coin.pegType, pegRates, meta?.goldOunces);
                    const price = coin.price;
                    const ratio = (price != null && typeof price === "number" && ref > 0)
                      ? Math.abs(price / ref - 1)
                      : null;
                    const colorClass = ratio === null
                      ? "text-muted-foreground"
                      : ratio < 0.005
                        ? "text-green-500"
                        : ratio < 0.02
                          ? "text-yellow-500"
                          : "text-red-500";
                    return (
                      <span className={colorClass}>
                        {formatPegDeviation(price, ref)}
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatCurrency(circulating)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-sm">
                  <span className={change24h >= 0 ? "text-green-500" : "text-red-500"}>
                    {prevDay > 0 ? (
                      <>{change24h >= 0 ? "↑" : "↓"} {formatPercentChange(circulating, prevDay)}</>
                    ) : "N/A"}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right font-mono tabular-nums text-sm">
                  <span className={change7d >= 0 ? "text-green-500" : "text-red-500"}>
                    {prevWeek > 0 ? (
                      <>
                        <span className="hidden sm:inline">
                          <MiniSparkline values={[getPrevWeek(coin, pegRates), getPrevDay(coin, pegRates), getCirculating(coin, pegRates)]} />
                        </span>
                        {change7d >= 0 ? "↑" : "↓"} {formatPercentChange(circulating, prevWeek)}
                      </>
                    ) : "N/A"}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right font-mono tabular-nums text-sm">
                  {(() => {
                    if (meta?.flags.navToken) {
                      return <span className="text-muted-foreground">—</span>;
                    }
                    const pegCoin = pegScores?.get(coin.id);
                    if (!pegCoin || pegCoin.pegScore === null) {
                      return <span className="text-muted-foreground">—</span>;
                    }
                    const score = pegCoin.pegScore;
                    const colorClass = score >= 90 ? "text-emerald-500" : score >= 70 ? "text-amber-500" : "text-red-500";
                    return <span className={colorClass}>{score}</span>;
                  })()}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center">
                  {(() => {
                    const rating = bluechipRatings?.[coin.id];
                    if (!rating) return <span className="text-muted-foreground">—</span>;
                    const colorCls = GRADE_COLORS[rating.grade] ?? "";
                    return (
                      <a
                        href={`${BLUECHIP_REPORT_BASE}/${rating.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Badge variant="outline" className={`text-xs font-mono ${colorCls}`}>
                          {rating.grade}
                        </Badge>
                      </a>
                    );
                  })()}
                </TableCell>
                <TableCell className="hidden md:table-cell text-center">
                  {meta && (
                    <Badge variant="outline" className={`text-xs ${BACKING_COLORS[meta.flags.backing] ?? ""}`}>
                      {meta.flags.backing === "rwa-backed" ? "RWA" : meta.flags.backing === "crypto-backed" ? "Crypto" : "Algo"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-center">
                  {meta && (
                    <Badge variant="outline" className={`text-xs ${GOVERNANCE_COLORS[meta.flags.governance] ?? ""}`}>
                      {meta.flags.governance === "centralized" ? "CeFi" : meta.flags.governance === "centralized-dependent" ? "CeFi-Dep" : "DeFi"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1 justify-center">
                    {meta?.flags.pegCurrency !== "USD" && (
                      <Badge variant="secondary" className="text-xs">
                        {meta?.flags.pegCurrency}
                      </Badge>
                    )}
                    {meta?.flags.yieldBearing && (
                      <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        Yield
                      </Badge>
                    )}
                    {meta?.flags.rwa && (
                      <Badge variant="secondary" className="text-xs bg-sky-500/10 text-sky-500 border-sky-500/20">
                        RWA
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                {searchQuery ? `No results for "${searchQuery}"` : "No stablecoin data available"}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {sorted.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {sorted.length} stablecoins
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
