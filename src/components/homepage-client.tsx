"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, RefreshCw, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useStablecoins } from "@/hooks/use-stablecoins";
import { useLogos } from "@/hooks/use-logos";
import { usePegSummary } from "@/hooks/use-peg-summary";
import { DashboardStats } from "@/components/dashboard-stats";
import { PegMonitor } from "@/components/peg-monitor";
import { StablecoinTable } from "@/components/stablecoin-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import { derivePegRates } from "@/lib/peg-rates";
import type { PegSummaryCoin, PegCurrency, GovernanceType } from "@/lib/types";

const VALID_PEG_FILTERS = new Set(["all", "USD", "EUR", "GOLD"]);
const VALID_TYPE_FILTERS = new Set(["all", "centralized", "centralized-dependent", "decentralized"]);

export function HomepageClient() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, dataUpdatedAt } = useStablecoins();
  const { data: logos } = useLogos();
  const { data: pegSummaryData, isLoading: pegLoading } = usePegSummary();
  const metaById = useMemo(() => new Map(TRACKED_STABLECOINS.map((s) => [s.id, s])), []);
  const pegScores = useMemo(() => {
    const map = new Map<string, PegSummaryCoin>();
    if (!pegSummaryData?.coins) return map;
    for (const coin of pegSummaryData.coins) {
      map.set(coin.id, coin);
    }
    return map;
  }, [pegSummaryData]);
  const pegRates = useMemo(() => derivePegRates(data?.peggedAssets ?? [], metaById, data?.fxFallbackRates), [data, metaById]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");

  // Peg tracker filters (from URL params)
  const rawPeg = searchParams.get("peg") ?? "all";
  const rawType = searchParams.get("type") ?? "all";
  const pegSearchQuery = searchParams.get("pq") ?? "";
  const pegFilter = (VALID_PEG_FILTERS.has(rawPeg) ? rawPeg : "all") as PegCurrency | "all";
  const typeFilter = (VALID_TYPE_FILTERS.has(rawType) ? rawType : "all") as GovernanceType | "all";

  const updateParams = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const setPegFilter = useCallback((v: PegCurrency | "all") => updateParams("peg", v), [updateParams]);
  const setTypeFilter = useCallback((v: GovernanceType | "all") => updateParams("type", v), [updateParams]);
  const setPegSearchQuery = useCallback((v: string) => updateParams("pq", v), [updateParams]);

  const filteredPegCoins = useMemo(() => (pegSummaryData?.coins ?? []).filter((c) => {
    if (pegFilter !== "all" && c.pegCurrency !== pegFilter) return false;
    if (typeFilter !== "all" && c.governance !== typeFilter) return false;
    if (pegSearchQuery) {
      const q = pegSearchQuery.toLowerCase().trim();
      if (!c.name.toLowerCase().includes(q) && !c.symbol.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [pegSummaryData, pegFilter, typeFilter, pegSearchQuery]);

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive flex items-center justify-between">
          <span>Failed to load stablecoin data. Please check your connection.</span>
          <button
            onClick={() => window.location.reload()}
            className="text-sm font-medium underline hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Dashboard Stats (merged market + peg KPIs) ── */}
      <DashboardStats
        data={data?.peggedAssets}
        pegRates={pegRates}
        summary={pegSummaryData?.summary ?? null}
        pegLoading={pegLoading}
      />

      {/* ── Peg Monitor (Heatmap | Leaderboard tabs) ── */}
      <PegMonitor
        coins={filteredPegCoins}
        logos={logos}
        isLoading={pegLoading}
        pegFilter={pegFilter}
        typeFilter={typeFilter}
        onPegFilterChange={setPegFilter}
        onTypeFilterChange={setTypeFilter}
        searchQuery={pegSearchQuery}
        onSearchChange={setPegSearchQuery}
      />

      {/* ── Depeg History CTA ── */}
      <Link
        href="/depegs/"
        className="flex items-center justify-between rounded-lg border border-dashed border-muted-foreground/25 px-4 py-3 hover:border-muted-foreground/50 transition-colors group"
      >
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Depeg History</p>
          <p className="text-xs text-muted-foreground">
            Timeline and feed of historical depeg events.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          View history
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>

      {/* ── Stablecoin Table ── */}
      <div id="filter-bar" className="space-y-3 sticky top-14 z-40 bg-background pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
              aria-label="Search stablecoins by name or symbol"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="shrink-0 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <StablecoinTable
        data={data?.peggedAssets}
        isLoading={isLoading}
        activeFilters={[]}
        logos={logos}
        pegRates={pegRates}
        searchQuery={searchQuery}
        pegScores={pegScores}
      />

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
