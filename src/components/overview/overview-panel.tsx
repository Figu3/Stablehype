"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClearV1Overview } from "@/hooks/use-clear-v1";
import { useSeveCarry } from "@/hooks/use-seve";
import { formatUSD } from "../clear-protocol/format";
import { periodFeeSplit } from "../clear-protocol/v1/daily-chart";
import { bps, money } from "../clear-protocol/v1/helpers";
import { GRID, Section, Tile, UNKNOWN } from "./tiles";

const signed = (v: number) => `${v < 0 ? "-" : ""}${money(Math.abs(v))}`;
/** `part` of `whole` as a whole percent, or unknown when either is missing or there is nothing to divide by. */
const pct = (part: number | null | undefined, whole: number | null | undefined) =>
  part == null || !whole ? UNKNOWN : `${Math.round((part / whole) * 100)}%`;


/** Clear and Sève on one page: what Clear does, what Sève owes, and how much of Clear is Sève's capital. */
export function OverviewPanel() {
  const overviewQuery = useClearV1Overview();
  const carryQuery = useSeveCarry();
  const overview = overviewQuery.data;
  const carry = carryQuery.data;
  const loading = overviewQuery.isLoading;
  const carryLoading = carryQuery.isLoading;

  const all = overview?.allTime;
  const split = all ? periodFeeSplit(all) : null;
  const seve = overview?.seve;
  const reserves = overview?.state?.reserves ?? [];
  const position = new Map((seve?.positions ?? []).map((p) => [p.address, p]));
  const span = all ? `Over ${all.days} ${all.days === 1 ? "day" : "days"}` : "All time";
  const usd = (v: number | null | undefined) => (v == null ? UNKNOWN : formatUSD(v));

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Clear and Sève</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Clear swaps stablecoins at their redemption value. Sève borrows on Wildcat and supplies most of
          Clear&apos;s liquidity. All figures at par, read from Ethereum and Plasma.
        </p>
      </div>

      <Section title="Clear" intro="The exchange: liquidity, flow and what it charges." href="/" link="Clear dashboard">
        <div className={GRID}>
          <Tile label="Net TVL" loading={loading} value={usd(overview?.tvl.netTvl)} note="Reserves less IOU debt" />
          <Tile label="Swap volume" loading={loading} value={all ? money(all.swapVolume) : UNKNOWN}
            note={all ? `${span}, ${all.swapCount} swaps` : span} />
          <Tile label="Fees kept" loading={loading} value={all ? money(all.revenue.total) : UNKNOWN} note="LPs and treasury, all time" />
          <Tile label="Average fee" loading={loading}
            value={split ? bps(split.lp + split.treasury + split.trader) : UNKNOWN} note="Of swap volume, all time" />
        </div>
      </Section>

      <Section title="Sève" intro="The liquidity provider: a Wildcat credit line on Plasma, put to work in Clear." href="/seve/" link="Sève detail">
        {carryQuery.isError && !carry ? (
          <p className="text-sm text-muted-foreground">Loan data unavailable</p>
        ) : (
          <div className={GRID}>
            <Tile label="Lent to Sève" loading={carryLoading} value={usd(carry?.principal)} note="Principal on Wildcat, Plasma" />
            <Tile label="Drawn" loading={carryLoading} value={usd(carry?.owed)} note="The rest sits in the market" />
            <Tile label="Interest accrued" loading={carryLoading} value={carry?.interest == null ? UNKNOWN : money(carry.interest)} note="Since the first loan" />
            <Tile label="In Clear reserves" loading={loading} value={usd(seve?.value)} note="Value of Sève's reserve shares" />
          </div>
        )}
      </Section>

      <Section title="Sève in Clear" intro="How much of Clear's liquidity and activity is Sève's own.">
        <div className={GRID}>
          <Tile label="Share of liquidity" loading={loading} value={pct(seve?.value, overview?.tvl.netTvl)} note="Sève's shares over net TVL" />
          <Tile label="Share of swap volume" loading={loading} value={pct(seve?.allTime.swapVolume, all?.swapVolume)}
            note={seve ? `${money(seve.allTime.swapVolume)} swapped by Sève's Safes` : "By Sève's Safes"} />
          <Tile label="Share of rebalances" loading={loading} value={pct(seve?.allTime.rebalanceVolume, all?.rebalanceVolume)}
            note={seve ? `${seve.allTime.rebalanceCount} run by Sève's Safes` : "By Sève's Safes"} />
          <Tile label="LP result" loading={loading}
            value={all ? signed(all.revenue.swapLp + all.revenue.flashLp + all.revenue.rebalanceResult) : UNKNOWN}
            note={all ? `${money(all.revenue.swapLp + all.revenue.flashLp)} fees, ${signed(all.revenue.rebalanceResult)} rebalances` : "Fees and rebalances"} />
        </div>

        {reserves.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reserve</TableHead>
                <TableHead className="text-right">Net value</TableHead>
                <TableHead className="text-right">Sève&apos;s share</TableHead>
                <TableHead className="text-right">Sève&apos;s value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reserves.map((r) => {
                const p = position.get(r.address);
                return (
                  <TableRow key={r.address}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.netPar)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p?.share == null ? UNKNOWN : `${(p.share * 100).toFixed(1)}%`}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{usd(p?.value)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground max-w-2xl">
          Meta reserves hold Base LP, so their value already includes their part of the Base reserve. LP result is for
          all LPs of Clear, not Sève alone.
        </p>
      </Section>
    </div>
  );
}
