"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClearV1Gas, useClearV1Overview } from "@/hooks/use-clear-v1";
import { ClearProtocolPanel } from "../clear-protocol-panel";
import { formatUSD } from "../format";
import { KPICard } from "../kpi-card";
import { ActivityFeed } from "./activity-feed";
import { DailyChart } from "./daily-chart";
import { GasTable } from "./gas-table";
import { OracleFeeds } from "./oracle-feeds";
import { useNowSeconds } from "./use-now";
import { PoolsTable } from "./pools-table";
import { ReservesTable } from "./reserves-table";
import { RoutesPanel } from "./routes-panel";
import { StatusStrip } from "./status-strip";

const STALE_AFTER_SECONDS = 1800;

export function ClearV1Panel() {
  const [showHistory, setShowHistory] = useState(false);
  const overviewQuery = useClearV1Overview();
  const gasQuery = useClearV1Gas();
  const now = useNowSeconds();
  const overview = overviewQuery.data;
  const loading = overviewQuery.isLoading;

  if (overviewQuery.isError && !overview) {
    return <p className="text-sm text-muted-foreground">Clear V1 data unavailable</p>;
  }

  // Events can go quiet with no new rows, so judge them by the sync job, not the newest row.
  const stateStale = overview?.updatedAt != null && now - overview.updatedAt > STALE_AFTER_SECONDS;
  const eventsStale = overview?.eventsSyncedAt != null && now - overview.eventsSyncedAt > STALE_AFTER_SECONDS;
  const stale = stateStale || eventsStale;
  const week = overview?.periods.find((p) => p.days === 7);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight mr-1">Clear V1</h1>
        {overview && <StatusStrip overview={overview} stale={stale} now={now} />}
        <span className="text-xs text-muted-foreground ml-auto">All figures at par</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Gross TVL" value={overview?.tvl.grossTvl != null ? formatUSD(overview.tvl.grossTvl) : null}
          placeholder="oracle stale" accent="blue" isLoading={loading} />
        <KPICard label="Net TVL" value={overview?.tvl.netTvl != null ? formatUSD(overview.tvl.netTvl) : null}
          placeholder="oracle stale"
          sub={overview?.tvl.iouDebt != null ? `IOU debt ${formatUSD(overview.tvl.iouDebt)}` : undefined}
          accent="violet" isLoading={loading} />
        <KPICard label="7D volume" value={week ? formatUSD(week.swapVolume) : null}
          accent="emerald" isLoading={loading} />
        <KPICard label="7D revenue" value={week ? formatUSD(week.revenue.total) : null}
          sub="Spread only" accent="amber" isLoading={loading} />
      </div>

      <DailyChart daily={overview?.daily} />

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="max-w-full overflow-x-auto justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="ops">Ops</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-3">
          {overview && <ReservesTable overview={overview} />}
          {overview && <RoutesPanel overview={overview} />}
        </TabsContent>

        <TabsContent value="pools" className="pt-3">
          {overview && <PoolsTable overview={overview} />}
        </TabsContent>

        <TabsContent value="ops" className="space-y-6 pt-3">
          {gasQuery.data ? (
            <GasTable gas={gasQuery.data} />
          ) : gasQuery.isError ? (
            <p className="text-sm text-muted-foreground">Gas data unavailable</p>
          ) : null}
          {overview?.state && <OracleFeeds state={overview.state} />}
        </TabsContent>

        <TabsContent value="activity" className="pt-3">
          <ActivityFeed />
        </TabsContent>

      </Tabs>

      <button type="button" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}
        className="text-xs text-muted-foreground hover:text-foreground">
        {showHistory ? "Hide v0.2 history" : "Show v0.2 history"}
      </button>
      {showHistory && <ClearProtocolPanel />}
    </section>
  );
}
