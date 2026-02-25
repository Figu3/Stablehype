"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Search, RefreshCw, ArrowRight, Activity } from "lucide-react";
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
import { TRACKED_STABLECOINS, CLEAR_ORACLE_IDS } from "@/lib/stablecoins";
import { useClearMode } from "@/components/clear-mode-context";
import { ClearProtocolPanel } from "@/components/clear-protocol/clear-protocol-panel";
import { derivePegRates } from "@/lib/peg-rates";
import type { PegSummaryCoin, PegCurrency, RedemptionType } from "@/lib/types";

const VALID_PEG_FILTERS = new Set(["all", "USD", "EUR", "GOLD"]);
const VALID_REDEMPTION_FILTERS = new Set(["all", "direct", "cdp", "psm", "nav", "secondary-only"]);
const MAJOR_CHAINS = ["Ethereum", "Arbitrum", "Optimism", "Base", "Polygon", "BSC", "Avalanche", "Solana", "Tron"];

export function HomepageClient() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, dataUpdatedAt } = useStablecoins();
  const { data: logos } = useLogos();
  const { data: pegSummaryData, isLoading: pegLoading } = usePegSummary();
  const { clearMode } = useClearMode();
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

  // Build a map of id → chains from DefiLlama data
  const chainsById = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const asset of data?.peggedAssets ?? []) {
      map.set(asset.id, asset.chains ?? []);
    }
    return map;
  }, [data]);

  // Enrich peg summary coins with chain data
  const enrichedPegCoins = useMemo(() =>
    (pegSummaryData?.coins ?? []).map((c) => ({
      ...c,
      chains: chainsById.get(c.id) ?? [],
    })),
  [pegSummaryData, chainsById]);

  // Derive available chain options from enriched data
  const chainOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of enrichedPegCoins) {
      for (const chain of c.chains ?? []) {
        counts.set(chain, (counts.get(chain) ?? 0) + 1);
      }
    }
    // Show major chains first, then others sorted by count
    const major = MAJOR_CHAINS.filter((ch) => counts.has(ch));
    const others = [...counts.keys()]
      .filter((ch) => !MAJOR_CHAINS.includes(ch))
      .sort((a, b) => counts.get(b)! - counts.get(a)!);
    return [...major, ...others];
  }, [enrichedPegCoins]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");

  // Peg tracker filters (from URL params)
  const rawPeg = searchParams.get("peg") ?? "all";
  const rawRedemption = searchParams.get("redemption") ?? "all";
  const rawChain = searchParams.get("chain") ?? "all";
  const pegSearchQuery = searchParams.get("pq") ?? "";
  const pegFilter = (VALID_PEG_FILTERS.has(rawPeg) ? rawPeg : "all") as PegCurrency | "all";
  const redemptionFilter = (VALID_REDEMPTION_FILTERS.has(rawRedemption) ? rawRedemption : "all") as RedemptionType | "all";
  const chainFilter = rawChain;

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
  const setRedemptionFilter = useCallback((v: RedemptionType | "all") => updateParams("redemption", v), [updateParams]);
  const setChainFilter = useCallback((v: string) => updateParams("chain", v), [updateParams]);
  const setPegSearchQuery = useCallback((v: string) => updateParams("pq", v), [updateParams]);

  const filteredPegCoins = useMemo(() => enrichedPegCoins.filter((c) => {
    if (clearMode && !CLEAR_ORACLE_IDS.has(c.id)) return false;
    if (pegFilter !== "all" && c.pegCurrency !== pegFilter) return false;
    if (redemptionFilter !== "all" && c.redemptionType !== redemptionFilter) return false;
    if (chainFilter !== "all" && !(c.chains ?? []).includes(chainFilter)) return false;
    if (pegSearchQuery) {
      const q = pegSearchQuery.toLowerCase().trim();
      if (!c.name.toLowerCase().includes(q) && !c.symbol.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [enrichedPegCoins, clearMode, pegFilter, redemptionFilter, chainFilter, pegSearchQuery]);

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  // L-2: Cmd+K / Ctrl+K search shortcut
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // M-2: Sticky filter bar shadow on scroll
  const [filterBarScrolled, setFilterBarScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setFilterBarScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive flex items-center justify-between">
          <span>Failed to load stablecoin data. Please check your connection.</span>
          <button
            onClick={() => window.location.reload()}
            className="text-sm font-medium underline hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── C-2 + H-3 + L-4: Hero section with brand identity ── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-frost-blue" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Stablecoin Analytics
          </h1>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
          Real-time peg monitoring, market caps, and on-chain analytics for{" "}
          <span className="font-mono text-foreground">{TRACKED_STABLECOINS.length}</span>{" "}
          stablecoins across every chain.
        </p>
      </section>

      {/* ── Dashboard Stats (merged market + peg KPIs) ── */}
      <DashboardStats
        data={data?.peggedAssets}
        pegRates={pegRates}
        summary={pegSummaryData?.summary ?? null}
        pegLoading={pegLoading}
        clearMode={clearMode}
      />

      {/* ── Clear Protocol Operations (visible only in Clear Mode) ── */}
      {clearMode && <ClearProtocolPanel />}

      {/* ── Peg Monitor (Heatmap | Leaderboard tabs) ── */}
      <PegMonitor
        coins={filteredPegCoins}
        logos={logos}
        isLoading={pegLoading}
        pegFilter={pegFilter}
        redemptionFilter={redemptionFilter}
        chainFilter={chainFilter}
        chainOptions={chainOptions}
        onPegFilterChange={setPegFilter}
        onRedemptionFilterChange={setRedemptionFilter}
        onChainFilterChange={setChainFilter}
        searchQuery={pegSearchQuery}
        onSearchChange={setPegSearchQuery}
      />

      {/* ── Depeg History CTA ── */}
      <Link
        href="/depegs/"
        className="group flex items-center justify-between rounded-xl border border-dashed border-muted-foreground/25 px-5 py-4 hover:border-frost-blue/50 hover:bg-frost-blue/5 transition-all"
      >
        <div className="space-y-0.5">
          <p className="text-sm font-medium group-hover:text-frost-blue transition-colors">Depeg History</p>
          <p className="text-xs text-muted-foreground">
            Timeline and feed of historical depeg events.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground group-hover:text-frost-blue transition-colors">
          View history
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>

      {/* ── Stablecoin Table ── */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">All Stablecoins</h2>
        <p className="text-sm text-muted-foreground">Browse and compare every tracked stablecoin.</p>
      </div>

      <div
        id="filter-bar"
        className={`space-y-3 sticky top-14 z-40 bg-background/95 backdrop-blur pb-3 transition-shadow ${filterBarScrolled ? "shadow-sm border-b border-border/50" : ""}`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search by name or symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
              aria-label="Search stablecoins by name or symbol"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
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
        clearOnly={clearMode}
      />

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
