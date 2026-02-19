"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PegHeatmap } from "@/components/peg-heatmap";
import { PegLeaderboard } from "@/components/peg-leaderboard";
import type { PegSummaryCoin, PegCurrency, GovernanceType } from "@/lib/types";

interface PegMonitorProps {
  coins: PegSummaryCoin[];
  logos?: Record<string, string>;
  isLoading: boolean;
  pegFilter: PegCurrency | "all";
  typeFilter: GovernanceType | "all";
  onPegFilterChange: (v: PegCurrency | "all") => void;
  onTypeFilterChange: (v: GovernanceType | "all") => void;
  searchQuery?: string;
  onSearchChange?: (v: string) => void;
}

export function PegMonitor({
  coins,
  logos,
  isLoading,
  pegFilter,
  typeFilter,
  onPegFilterChange,
  onTypeFilterChange,
  searchQuery,
  onSearchChange,
}: PegMonitorProps) {
  return (
    <div id="peg-tracker" className="scroll-mt-20">
      <Tabs defaultValue="heatmap">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Peg Tracker</h2>
            <p className="text-sm text-muted-foreground">
              Real-time peg deviation monitoring and weighted peg scores.
            </p>
          </div>
          <TabsList variant="line">
            <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="heatmap">
          <PegHeatmap
            coins={coins}
            logos={logos}
            isLoading={isLoading}
            pegFilter={pegFilter}
            typeFilter={typeFilter}
            onPegFilterChange={onPegFilterChange}
            onTypeFilterChange={onTypeFilterChange}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
          />
        </TabsContent>

        <TabsContent value="leaderboard">
          <PegLeaderboard
            coins={coins}
            logos={logos}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
