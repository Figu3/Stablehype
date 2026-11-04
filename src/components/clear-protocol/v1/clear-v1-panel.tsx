"use client";

import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useClearV1Gas, useClearV1Overview } from "@/hooks/use-clear-v1";
import { formatUSD } from "../format";
import { KPICard } from "../kpi-card";
import { ActivityFeed } from "./activity-feed";
import { GasTable } from "./gas-table";
import { usd } from "./helpers";
import { OracleFeeds } from "./oracle-feeds";
import { useNowSeconds } from "./use-now";
import { PoolsTable } from "./pools-table";
import { ReservesTable } from "./reserves-table";

const STALE_AFTER_SECONDS = 1800;

export function ClearV1Panel() {
  const overviewQuery = useClearV1Overview();
  const gasQuery = useClearV1Gas();
  const now = useNowSeconds();
  const overview = overviewQuery.data;
  const loading = overviewQuery.isLoading;

  if (overviewQuery.isError) {
    return <p className="text-sm text-muted-foreground">Clear V1 data unavailable</p>;
  }

  const stale = overview?.updatedAt != null && now - overview.updatedAt > STALE_AFTER_SECONDS;
  const week = overview?.periods.find((p) => p.days === 7);
  const month = overview?.periods.find((p) => p.days === 30);
  const partialSub = overview?.tvl.partial ? "Oracle stale, partial data" : undefined;
  const noSwaps = month?.swapCount === 0;
  const hasDaily = (overview?.daily.length ?? 0) > 0;

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Clear V1</h2>
        {stale && (
          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-500">Stale data</span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Gross TVL (at par)" value={overview?.tvl.grossTvl != null ? formatUSD(overview.tvl.grossTvl) : null}
          placeholder="oracle stale" sub={partialSub} accent="blue" isLoading={loading} />
        <KPICard label="Net TVL (at par)" value={overview?.tvl.netTvl != null ? formatUSD(overview.tvl.netTvl) : null}
          placeholder="oracle stale"
          sub={partialSub ?? (overview?.tvl.iouDebt != null ? `IOU debt ${formatUSD(overview.tvl.iouDebt)}` : undefined)}
          accent="violet" isLoading={loading} />
        <KPICard label="7D swap volume (at par)" value={week ? formatUSD(week.swapVolume) : null}
          accent="emerald" isLoading={loading} />
        <KPICard label="7D revenue (at par)" value={week ? formatUSD(week.revenue.total) : null}
          accent="amber" isLoading={loading} />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Daily swap volume and revenue (at par)</h3>
        {noSwaps ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">No swaps yet</div>
        ) : !hasDaily ? (
          <div className="h-32 bg-muted/50 rounded animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={overview!.daily} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="volume" tickFormatter={formatUSD} tick={{ fontSize: 10, fill: "#a1a1aa" }}
                axisLine={false} tickLine={false} width={50} />
              <YAxis yAxisId="revenue" orientation="right" tickFormatter={formatUSD}
                tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={50} />
              <Tooltip formatter={(v) => usd(typeof v === "number" ? v : null)} />
              <Bar yAxisId="volume" dataKey="swapVolume" name="Swap volume" fill="hsl(263 70% 58%)" isAnimationActive={false} />
              <Line yAxisId="revenue" dataKey="revenue" name="Revenue" stroke="hsl(38 92% 60%)" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {overview && <ReservesTable overview={overview} />}
      {overview && <PoolsTable overview={overview} />}
      {overview?.state && <OracleFeeds state={overview.state} />}
      {gasQuery.data && <GasTable gas={gasQuery.data} />}
      <ActivityFeed />
    </section>
  );
}
