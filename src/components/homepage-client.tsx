"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, RefreshCw } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useStablecoins } from "@/hooks/use-stablecoins";
import { useLogos } from "@/hooks/use-logos";
import { useDepegEvents } from "@/hooks/use-depeg-events";
import { usePegSummary } from "@/hooks/use-peg-summary";
import { StablecoinTable } from "@/components/stablecoin-table";
import { CategoryStats } from "@/components/category-stats";
import { MarketHighlights } from "@/components/market-highlights";
import { TotalMcapChart } from "@/components/total-mcap-chart";
import { PegTrackerStats } from "@/components/peg-tracker-stats";
import { PegHeatmap } from "@/components/peg-heatmap";
import { PegLeaderboard } from "@/components/peg-leaderboard";
import { DepegTimeline } from "@/components/depeg-timeline";
import { DepegFeed } from "@/components/depeg-feed";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import { derivePegRates } from "@/lib/peg-rates";
import type { DepegEvent, PegSummaryCoin, PegCurrency, GovernanceType } from "@/lib/types";

const VALID_PEG_FILTERS = new Set(["all", "USD", "EUR", "GOLD"]);
const VALID_TYPE_FILTERS = new Set(["all", "centralized", "centralized-dependent", "decentralized"]);

export function HomepageClient() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, dataUpdatedAt } = useStablecoins();
  const { data: logos } = useLogos();
  const { data: depegData } = useDepegEvents();
  const { data: pegSummaryData, isLoading: pegLoading } = usePegSummary();
  const metaById = useMemo(() => new Map(TRACKED_STABLECOINS.map((s) => [s.id, s])), []);
  const depegEventsByStablecoin = useMemo(() => {
    const map = new Map<string, DepegEvent[]>();
    if (!depegData?.events) return map;
    for (const event of depegData.events) {
      const arr = map.get(event.stablecoinId);
      if (arr) arr.push(event);
      else map.set(event.stablecoinId, [event]);
    }
    return map;
  }, [depegData]);
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
    <div className="space-y-8">
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

      {/* ── Market Overview ── */}
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Market Overview</h2>
          <p className="text-sm text-muted-foreground">
            Aggregate supply, governance breakdown, and dominance across all tracked stablecoins.
          </p>
        </div>

        <CategoryStats data={data?.peggedAssets} pegRates={pegRates} />

        <TotalMcapChart />

        <MarketHighlights data={data?.peggedAssets} logos={logos} pegRates={pegRates} />
      </section>

      {/* ── Peg Tracker Section ── */}
      <div id="peg-tracker" className="space-y-6 border-t pt-8 scroll-mt-20">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Peg Tracker</h2>
          <p className="text-sm text-muted-foreground">
            Real-time peg deviation monitoring, weighted peg scores, and depeg event history.
          </p>
        </div>

        <PegTrackerStats summary={pegSummaryData?.summary ?? null} isLoading={pegLoading} />

        <PegHeatmap
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

        <PegLeaderboard
          coins={filteredPegCoins}
          logos={logos}
          isLoading={pegLoading}
        />

        <DepegTimeline
          events={depegData?.events ?? []}
          logos={logos}
        />

        <DepegFeed
          events={depegData?.events ?? []}
          logos={logos}
        />
      </div>

      {/* ── Stablecoin Table Section ── */}
      <div id="filter-bar" className="space-y-3 border-t pt-6 sticky top-14 z-40 bg-background pb-3">
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
