"use client";

import { useClearV1Overview, type ClearV1Overview } from "@/hooks/use-clear-v1";
import { IS_CONTROL_SITE } from "@/lib/site-mode";
import { formatUSD } from "../format";
import { ActivitySummary, change } from "./activity-summary";
import { ControlTabs } from "./control-tabs";
import { money, shortDate } from "./helpers";
import { useNowSeconds } from "./use-now";
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

/** Aggregator fees the ClearAlphaFeeRouter took out of fills. Not Clear revenue: owed to the aggregator. */
function AlphaFees({ fees }: { fees: NonNullable<ClearV1Overview["alphaFees"]> }) {
  const since = fees.since === null ? null : shortDate(new Date(fees.since * 1000).toISOString().slice(0, 10));
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <div>
        <div className="text-xs font-medium text-muted-foreground">Aggregator fees collected</div>
        <div className={`mt-0.5 text-xl sm:text-2xl font-semibold tabular-nums ${fees.total === null ? "text-muted-foreground" : ""}`}>
          {fees.total === null ? "-" : money(fees.total)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground sm:text-right">
        {fees.fills === 0
          ? "No fill through the fee router yet"
          : `${fees.fills} ${fees.fills === 1 ? "fill" : "fills"} through the fee router${fees.volume === null ? "" : `, ${money(fees.volume)} delivered`}${since ? `, since ${since}` : ""}`}
        <br />
        Taken out of the trader output for KyberSwap. Not counted in the fees above.
      </p>
    </div>
  );
}

export function ClearV1Panel() {
  const overviewQuery = useClearV1Overview();
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
  // The investor site shows the overview alone; the control center adds the other tabs.
  const overviewContent = overview && (
    <>
      <ReservesTable overview={overview} />
      <RoutesPanel overview={overview} />
    </>
  );

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
      {overview?.alphaFees && <AlphaFees fees={overview.alphaFees} />}

      {IS_CONTROL_SITE ? (
        <ControlTabs overview={overview} overviewContent={overviewContent} />
      ) : (
        overviewContent && <div className="space-y-8">{overviewContent}</div>
      )}
    </section>
  );
}
