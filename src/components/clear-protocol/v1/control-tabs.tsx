"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClearV1Gas, type ClearV1Overview } from "@/hooks/use-clear-v1";
import { ClearProtocolPanel } from "../clear-protocol-panel";
import { SeveSection } from "../seve-section";
import { ActivityFeed } from "./activity-feed";
import { GasTable } from "./gas-table";
import { OracleFeeds } from "./oracle-feeds";
import { PoolsTable } from "./pools-table";

/** The control center's homepage tabs. The investor site shows the overview alone, with no tab bar. */
export function ControlTabs({ overview, overviewContent }: {
  overview: ClearV1Overview | undefined; overviewContent: ReactNode;
}) {
  const gasQuery = useClearV1Gas();

  return (
    <Tabs defaultValue="overview">
      <TabsList variant="line" className="max-w-full overflow-x-auto overflow-y-hidden justify-start">
        <TabsTrigger value="overview" className="text-sm">Overview</TabsTrigger>
        <TabsTrigger value="pools" className="text-sm">Pools</TabsTrigger>
        <TabsTrigger value="ops" className="text-sm">Ops</TabsTrigger>
        <TabsTrigger value="activity" className="text-sm">Activity</TabsTrigger>
        <TabsTrigger value="seve" className="text-sm">Sève</TabsTrigger>
        <TabsTrigger value="history" className="text-sm">v0.2 history</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-8 pt-4">
        {overviewContent}
      </TabsContent>

      <TabsContent value="pools" className="pt-4">
        {overview && <PoolsTable overview={overview} />}
      </TabsContent>

      <TabsContent value="ops" className="space-y-8 pt-4">
        {gasQuery.data ? (
          <GasTable gas={gasQuery.data} />
        ) : gasQuery.isError ? (
          <p className="text-sm text-muted-foreground">Gas data unavailable</p>
        ) : null}
        {overview?.state && <OracleFeeds state={overview.state} />}
      </TabsContent>

      <TabsContent value="activity" className="pt-4">
        <ActivityFeed />
      </TabsContent>

      <TabsContent value="seve" className="pt-4">
        <SeveSection />
      </TabsContent>

      <TabsContent value="history" className="pt-4">
        <ClearProtocolPanel />
      </TabsContent>
    </Tabs>
  );
}
