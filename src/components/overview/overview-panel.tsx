"use client";

import { useClearV1Overview } from "@/hooks/use-clear-v1";
import { useSeveCarry, useSeveRebalances } from "@/hooks/use-seve";
import { formatUSD } from "../clear-protocol/format";
import { periodFeeSplit } from "../clear-protocol/v1/daily-chart";
import { bps, money } from "../clear-protocol/v1/helpers";
import { GRID, Section, Tile, UNKNOWN } from "./tiles";

const usd = (v: number | null | undefined) => (v == null ? UNKNOWN : formatUSD(v));
const cash = (v: number | null | undefined) => (v == null ? UNKNOWN : `${v < 0 ? "-" : ""}${money(Math.abs(v))}`);

/** Clear and Sève on one page: what the exchange does, and what the company that rebalances it borrows and earns. */
export function OverviewPanel() {
  const overviewQuery = useClearV1Overview();
  const carryQuery = useSeveCarry();
  const rebalanceQuery = useSeveRebalances();
  const overview = overviewQuery.data;
  const carry = carryQuery.data;
  const rebalances = rebalanceQuery.data;
  const loading = overviewQuery.isLoading;

  const all = overview?.allTime;
  const split = all ? periodFeeSplit(all) : null;
  const span = all ? `Over ${all.days} ${all.days === 1 ? "day" : "days"}` : "All time";

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Clear and Sève</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Clear swaps stablecoins at their redemption value. Sève keeps Clear&apos;s reserves balanced and
          converts what it takes out at 1:1 with the issuers.
        </p>
      </div>

      <Section title="Clear" intro="The exchange." href="/" link="Clear dashboard">
        <div className={GRID}>
          <Tile label="Net TVL" loading={loading} value={usd(overview?.tvl.netTvl)} note="Reserves less IOU debt" />
          <Tile label="Swap volume" loading={loading} value={all ? money(all.swapVolume) : UNKNOWN}
            note={all ? `${span}, ${all.swapCount} swaps` : span} />
          <Tile label="Fees" loading={loading} value={all ? money(all.revenue.total) : UNKNOWN} note="To LPs and treasury, all time" />
          <Tile label="Average fee" loading={loading}
            value={split ? bps(split.lp + split.treasury + split.trader) : UNKNOWN} note="Of swap volume, all time" />
        </div>
      </Section>

      <Section title="Sève" intro="The rebalancer, funded by a credit line on Wildcat." href="/seve/" link="Sève detail">
        <div className={GRID}>
          <Tile label="Borrowed" loading={carryQuery.isLoading} value={usd(carry?.principal)} note="Principal on Wildcat" />
          <Tile label="Interest accrued" loading={carryQuery.isLoading} value={cash(carry?.interest)} note="Since the first loan" />
          <Tile label="Rebalanced" loading={rebalanceQuery.isLoading} value={usd(rebalances?.volumeUsd)}
            note={rebalances ? `In ${rebalances.count} rebalances of Clear` : "Supplied to Clear"} />
          <Tile label="Conversion gain" loading={rebalanceQuery.isLoading} value={cash(rebalances?.netUsd)}
            note={rebalances ? `After ${rebalances.costBps} bp conversion cost (assumed)` : "From 1:1 conversion"} />
        </div>
        <p className="text-xs text-muted-foreground max-w-2xl">
          When a reserve holds too much of one stablecoin, Sève swaps it out at its redemption value, then
          converts it 1:1 with the issuer. The gain is the difference, and costs Clear&apos;s LPs nothing at
          redemption value.
        </p>
      </Section>
    </div>
  );
}
