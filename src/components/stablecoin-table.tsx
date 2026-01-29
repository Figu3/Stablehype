"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatCurrency, formatPrice, formatPegDeviation, formatPercentChange } from "@/lib/format";
import { getPegReference } from "@/lib/peg-rates";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import type { StablecoinData, FilterTag, SortConfig } from "@/lib/types";
import { getFilterTags } from "@/lib/types";
import { StablecoinLogo } from "@/components/stablecoin-logo";

interface StablecoinTableProps {
  data: StablecoinData[] | undefined;
  isLoading: boolean;
  activeFilters: FilterTag[];
  logos?: Record<string, string>;
  pegRates?: Record<string, number>;
}

function getCirculating(coin: StablecoinData): number {
  if (!coin.circulating) return 0;
  return Object.values(coin.circulating).reduce((s, v) => s + (v ?? 0), 0);
}

function getPrevDay(coin: StablecoinData): number {
  if (!coin.circulatingPrevDay) return 0;
  return Object.values(coin.circulatingPrevDay).reduce((s, v) => s + (v ?? 0), 0);
}

function getPrevWeek(coin: StablecoinData): number {
  if (!coin.circulatingPrevWeek) return 0;
  return Object.values(coin.circulatingPrevWeek).reduce((s, v) => s + (v ?? 0), 0);
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

export function StablecoinTable({ data, isLoading, activeFilters, logos, pegRates = {} }: StablecoinTableProps) {
  const [sort, setSort] = useState<SortConfig>({ key: "mcap", direction: "desc" });

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
    return data.filter((coin) => trackedIds.has(coin.id));
  }, [data, trackedIds]);

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
          aVal = getCirculating(a);
          bVal = getCirculating(b);
          break;
        case "change24h":
          aVal = getCirculating(a) - getPrevDay(a);
          bVal = getCirculating(b) - getPrevDay(b);
          break;
        case "change7d":
          aVal = getCirculating(a) - getPrevWeek(a);
          bVal = getCirculating(b) - getPrevWeek(b);
          break;
        default:
          aVal = getCirculating(a);
          bVal = getCirculating(b);
      }
      return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [filtered, sort]);

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px] text-right">#</TableHead>
            <TableHead className="w-[200px] cursor-pointer" onClick={() => toggleSort("name")}>
              Name <SortIcon columnKey="name" sort={sort} />
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("price")}>
              Price <SortIcon columnKey="price" sort={sort} />
            </TableHead>
            <TableHead className="text-right">Peg</TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("mcap")}>
              Market Cap <SortIcon columnKey="mcap" sort={sort} />
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("change24h")}>
              24h <SortIcon columnKey="change24h" sort={sort} />
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("change7d")}>
              7d <SortIcon columnKey="change7d" sort={sort} />
            </TableHead>
            <TableHead className="text-center">Backing</TableHead>
            <TableHead className="text-center">Type</TableHead>
            <TableHead className="text-center">Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((coin, index) => {
            const circulating = getCirculating(coin);
            const prevDay = getPrevDay(coin);
            const prevWeek = getPrevWeek(coin);
            const meta = TRACKED_STABLECOINS.find((s) => s.id === coin.id);
            const change24h = prevDay > 0 ? ((circulating - prevDay) / prevDay) * 100 : 0;
            const change7d = prevWeek > 0 ? ((circulating - prevWeek) / prevWeek) * 100 : 0;

            return (
              <TableRow key={coin.id}>
                <TableCell className="text-right text-muted-foreground text-xs">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/stablecoin/${coin.id}`}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    <StablecoinLogo src={logos?.[coin.id]} name={coin.name} size={24} />
                    <span>{coin.name}</span>
                    <span className="text-xs text-muted-foreground">{coin.symbol}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono">{formatPrice(coin.price)}</TableCell>
                <TableCell className="text-right">
                  {(() => {
                    const ref = getPegReference(coin.pegType, pegRates);
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
                <TableCell className="text-right font-mono">{formatCurrency(circulating)}</TableCell>
                <TableCell className="text-right">
                  <span className={change24h >= 0 ? "text-green-500" : "text-red-500"}>
                    {prevDay > 0 ? formatPercentChange(circulating, prevDay) : "N/A"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={change7d >= 0 ? "text-green-500" : "text-red-500"}>
                    {prevWeek > 0 ? formatPercentChange(circulating, prevWeek) : "N/A"}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {meta && (
                    <Badge variant="outline" className={`text-xs ${BACKING_COLORS[meta.flags.backing] ?? ""}`}>
                      {meta.flags.backing === "rwa-backed" ? "RWA" : meta.flags.backing === "crypto-backed" ? "Crypto" : "Algo"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {meta && (
                    <Badge variant="outline" className={`text-xs ${GOVERNANCE_COLORS[meta.flags.governance] ?? ""}`}>
                      {meta.flags.governance === "centralized" ? "CeFi" : meta.flags.governance === "centralized-dependent" ? "CeFi-Dep" : "DeFi"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
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
              <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                No stablecoin data available
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
