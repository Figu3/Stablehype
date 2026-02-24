"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PegHeatmap } from "@/components/peg-heatmap";
import { PegLeaderboard } from "@/components/peg-leaderboard";
import type { PegSummaryCoin, PegCurrency, RedemptionType } from "@/lib/types";

interface PegMonitorProps {
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

export function PegMonitor({
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
            redemptionFilter={redemptionFilter}
            chainFilter={chainFilter}
            chainOptions={chainOptions}
            onPegFilterChange={onPegFilterChange}
            onRedemptionFilterChange={onRedemptionFilterChange}
            onChainFilterChange={onChainFilterChange}
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
