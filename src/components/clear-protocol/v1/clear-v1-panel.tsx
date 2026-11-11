"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClearV1Gas, useClearV1Overview, type ClearV1Overview } from "@/hooks/use-clear-v1";
import { ClearProtocolPanel } from "../clear-protocol-panel";
import { formatUSD } from "../format";
import { SeveSection } from "../seve-section";
import { ActivityFeed } from "./activity-feed";
import { ActivitySummary, change } from "./activity-summary";
import { GasTable } from "./gas-table";
import { OracleFeeds } from "./oracle-feeds";
import { useNowSeconds } from "./use-now";
import { PoolsTable } from "./pools-table";
import { ReservesTable } from "./reserves-table";
import { RoutesPanel } from "./routes-panel";
import { StatusStrip } from "./status-strip";

const STALE_AFTER_SECONDS = 1800;
const TVL_COMPARE_DAYS = 7;

/** Net TVL change against the daily snapshot from a week ago, when there is one. */
function tvlChange(overview: ClearV1Overview, key: "grossTvl" | "netTvl"): string | null {
  const cutoff = new Date(Date.now() - TVL_COMPARE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const then = overview.dailyTvl.find((d) => d.date === cutoff)?.[key];
  return change(overview.tvl[key] ?? undefined, then ?? undefined);
}

function Stat({ label, value, note, delta, loading }: {
  label: string; value: string | null; note?: string; delta?: string | null; loading: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card px-3 sm:px-4 py-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {loading ? (
        <div className="mt-1 h-7 w-24 bg-muted/50 rounded animate-pulse" />
      ) : (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span className={`text-xl sm:text-2xl font-semibold tabular-nums ${value === null ? "text-muted-foreground" : ""}`}>
            {value ?? "oracle stale"}
          </span>
          {delta && (
            <span className={`text-xs tabular-nums ${delta.startsWith("+") ? "text-emerald-500" : delta.startsWith("-") ? "text-rose-500" : "text-muted-foreground"}`}>
              {delta} <span className="text-muted-foreground">in {TVL_COMPARE_DAYS}d</span>
            </span>
          )}
        </div>
      )}
      {note && <div className="hidden sm:block text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

export function ClearV1Panel() {
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
  const tvl = overview?.tvl;

  return (
    <section className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Clear V1</h1>
          <span className="text-xs text-muted-foreground">All figures at par</span>
        </div>
        {overview && <StatusStrip overview={overview} stale={stale} now={now} />}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Net TVL" loading={loading}
          value={tvl?.netTvl != null ? formatUSD(tvl.netTvl) : null}
          delta={overview ? tvlChange(overview, "netTvl") : null}
          note="Gross TVL less IOU debt" />
        <Stat label="Gross TVL" loading={loading}
          value={tvl?.grossTvl != null ? formatUSD(tvl.grossTvl) : null}
          delta={overview ? tvlChange(overview, "grossTvl") : null}
          note="Everything the reserves hold" />
        <Stat label="IOU debt" loading={loading}
          value={tvl?.iouDebt != null ? formatUSD(tvl.iouDebt) : null}
          note="Owed to IOU holders" />
      </div>

      <ActivitySummary overview={overview} loading={loading} />

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
          {overview && <ReservesTable overview={overview} />}
          {overview && <RoutesPanel overview={overview} />}
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
    </section>
  );
}
