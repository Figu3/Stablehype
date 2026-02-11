"use client";

import { useState, useCallback, useMemo } from "react";
import { Search } from "lucide-react";
import { useStablecoins } from "@/hooks/use-stablecoins";
import { useLogos } from "@/hooks/use-logos";
import { StablecoinTable } from "@/components/stablecoin-table";
import { CategoryStats } from "@/components/category-stats";
import { PegTypeChart } from "@/components/peg-type-chart";
import { MarketHighlights } from "@/components/market-highlights";
import { TotalMcapChart } from "@/components/total-mcap-chart";
import { ChainOverview } from "@/components/chain-overview";
import { BlacklistSummary } from "@/components/blacklist-summary";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import { derivePegRates } from "@/lib/peg-rates";
import type { FilterTag } from "@/lib/types";
import { FILTER_TAG_LABELS } from "@/lib/types";

interface FilterGroup {
  label: string;
  options: FilterTag[];
}

const FILTER_GROUPS: FilterGroup[] = [
  {
    label: "Peg",
    options: ["usd-peg", "eur-peg", "gold-peg", "other-peg"],
  },
  {
    label: "Type",
    options: ["centralized", "centralized-dependent", "decentralized"],
  },
  {
    label: "Backing",
    options: ["rwa-backed", "crypto-backed", "algorithmic"],
  },
  {
    label: "Features",
    options: ["yield-bearing", "rwa"],
  },
];

export default function HomePage() {
  const { data, isLoading, error } = useStablecoins();
  const { data: logos } = useLogos();
  const metaById = useMemo(() => new Map(TRACKED_STABLECOINS.map((s) => [s.id, s])), []);
  const pegRates = useMemo(() => derivePegRates(data?.peggedAssets ?? [], metaById), [data, metaById]);
  // One active value per group (empty string = "all" for that group)
  const [groupSelections, setGroupSelections] = useState<Record<string, FilterTag | "">>({});
  const [searchQuery, setSearchQuery] = useState("");

  const handleGroupChange = useCallback((groupLabel: string, value: string) => {
    setGroupSelections((prev) => ({
      ...prev,
      [groupLabel]: value as FilterTag | "",
    }));
  }, []);

  const clearAll = useCallback(() => setGroupSelections({}), []);

  // Collect active filters (one per group that has a selection)
  const activeFilters: FilterTag[] = Object.values(groupSelections).filter(
    (v): v is FilterTag => v !== ""
  );

  const hasFilters = activeFilters.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {TRACKED_STABLECOINS.length} stablecoins. Every chain. Every freeze.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          Signal lost. Retrying.
        </div>
      )}

      <CategoryStats data={data?.peggedAssets} />

      <TotalMcapChart />

      <PegTypeChart data={data?.peggedAssets} />

      <MarketHighlights data={data?.peggedAssets} logos={logos} pegRates={pegRates} />

      <div className="grid gap-5 lg:grid-cols-2">
        <ChainOverview data={data?.peggedAssets} />
        <BlacklistSummary />
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search stablecoins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</p>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FILTER_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
              <ToggleGroup
                type="single"
                value={groupSelections[group.label] ?? ""}
                onValueChange={(v) => handleGroupChange(group.label, v)}
                className="flex flex-wrap justify-start gap-1"
              >
                {group.options.map((opt) => (
                  <ToggleGroupItem
                    key={opt}
                    value={opt}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    {FILTER_TAG_LABELS[opt]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ))}
        </div>
      </div>

      <StablecoinTable
        data={data?.peggedAssets}
        isLoading={isLoading}
        activeFilters={activeFilters}
        logos={logos}
        pegRates={pegRates}
        searchQuery={searchQuery}
      />
    </div>
  );
}
