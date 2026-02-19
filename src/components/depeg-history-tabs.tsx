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
      <div className="flex items-center justify-end mb-4">
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
