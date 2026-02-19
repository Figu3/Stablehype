"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DepegTimeline } from "@/components/depeg-timeline";
import { DepegFeed } from "@/components/depeg-feed";
import type { DepegEvent } from "@/lib/types";

interface DepegHistoryTabsProps {
  events: DepegEvent[];
  logos?: Record<string, string>;
}

export function DepegHistoryTabs({ events, logos }: DepegHistoryTabsProps) {
  return (
    <Tabs defaultValue="timeline">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Depeg History</h2>
          <p className="text-sm text-muted-foreground">
            Historical depeg events and recovery patterns.
          </p>
        </div>
        <TabsList variant="line">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="feed">Feed</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="timeline">
        <DepegTimeline events={events} logos={logos} />
      </TabsContent>

      <TabsContent value="feed">
        <DepegFeed events={events} logos={logos} />
      </TabsContent>
    </Tabs>
  );
}
