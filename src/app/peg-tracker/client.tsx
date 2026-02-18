"use client";

import { useState } from "react";
import { usePegSummary } from "@/hooks/use-peg-summary";
import { useDepegEvents } from "@/hooks/use-depeg-events";
import { useLogos } from "@/hooks/use-logos";
import { PegTrackerStats } from "@/components/peg-tracker-stats";
import { PegHeatmap } from "@/components/peg-heatmap";
import { PegLeaderboard } from "@/components/peg-leaderboard";
import { DepegTimeline } from "@/components/depeg-timeline";
import { DepegFeed } from "@/components/depeg-feed";
import type { PegCurrency, GovernanceType } from "@/lib/types";

export function PegTrackerClient() {
  const { data: pegData, isLoading } = usePegSummary();
  const { data: eventsData } = useDepegEvents();
  const { data: logos } = useLogos();

  // Shared filter state
  const [pegFilter, setPegFilter] = useState<PegCurrency | "all">("all");
  const [typeFilter, setTypeFilter] = useState<GovernanceType | "all">("all");

  const filteredCoins = (pegData?.coins ?? []).filter((c) => {
    if (pegFilter !== "all" && c.pegCurrency !== pegFilter) return false;
    if (typeFilter !== "all" && c.governance !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PegTrackerStats summary={pegData?.summary ?? null} isLoading={isLoading} />

      <PegHeatmap
        coins={filteredCoins}
        logos={logos}
        isLoading={isLoading}
        pegFilter={pegFilter}
        typeFilter={typeFilter}
        onPegFilterChange={setPegFilter}
        onTypeFilterChange={setTypeFilter}
      />

      <PegLeaderboard
        coins={filteredCoins}
        logos={logos}
        isLoading={isLoading}
      />

      <DepegTimeline
        events={eventsData?.events ?? []}
        logos={logos}
      />

      <DepegFeed
        events={eventsData?.events ?? []}
        logos={logos}
      />
    </div>
  );
}
