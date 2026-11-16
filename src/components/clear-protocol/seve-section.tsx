"use client";

import { ExternalLink } from "lucide-react";
import { SEVE_SAFES } from "@shared/lib/clear-v1-config";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FLOW_WINDOWS, useSeveCapital, useSeveCarry, useSeveRebalances,
  type SeveHolding, type SeveRebalances, type SeveTokenFlow,
} from "@/hooks/use-seve";
import { GRID, Section, Tile, UNKNOWN } from "./tiles";
import { formatUSD } from "./format";
import { ActivityFeed } from "./v1/activity-feed";
import { amount, money, tokenLabel, type TokenMap } from "./v1/helpers";
import { SeveRebalanceTable } from "./v1/seve-rebalance-gains";

const WILDCAT_MARKET = "https://plasmascan.to/address/0x74c7861c3e706e7299654f89a3c0091184aa10f0";
const SAFE_ADDRESSES = SEVE_SAFES.map((s) => s.address);
const LINKS = [
  ...SEVE_SAFES.map((s) => ({ label: s.label, href: `https://etherscan.io/address/${s.address}` })),
  { label: "Wildcat market", href: WILDCAT_MARKET },
];

const usd = (v: number | null | undefined) => (v == null ? UNKNOWN : money(v));
const signed = (v: number | null | undefined) => (v == null ? UNKNOWN : `${v < 0 ? "-" : ""}${money(Math.abs(v))}`);
const DETAILS = "group rounded-xl border bg-card";
const SUMMARY = "cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground";

/** "19,467 USDC, 57 USDT", or a fallback when the Safe holds less than a dollar of anything. */
const holdings = (h: SeveHolding[] | undefined, tokens: TokenMap | undefined, empty: string) => {
  const shown = (h ?? []).filter((x) => x.amount >= 1);
  return shown.length > 0 ? shown.map((x) => `${amount(x.amount)} ${tokenLabel(x.token, tokens)}`).join(", ") : empty;
};

function FlowTable({ title, note, side, data }: {
  title: string; note: string; side: "redeemed" | "minted"; data: SeveRebalances | undefined;
}) {
  const rows = (data?.flows ?? []).filter((f: SeveTokenFlow) => f[side]["90d"] > 0);
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{note}</div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{data?.flows ? "Nothing in the last 90 days" : UNKNOWN}</p>
      ) : (
        <Table className="mt-1">
          <TableHeader>
            <TableRow>
              <TableHead>Stablecoin</TableHead>
              {FLOW_WINDOWS.map((w) => <TableHead key={w} className="text-right">{w}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => (
              <TableRow key={f.token}>
                <TableCell className="font-medium">{tokenLabel(f.token, data?.tokens)}</TableCell>
                {FLOW_WINDOWS.map((w) => (
                  <TableCell key={w} className="text-right font-mono tabular-nums">{f[side][w] > 0 ? formatUSD(f[side][w]) : UNKNOWN}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** Sève in three questions: what it can rebalance with, what it redeemed and minted, and what is left after interest. */
export function SeveSection() {
  const carryQuery = useSeveCarry();
  const rebalanceQuery = useSeveRebalances();
  const capitalQuery = useSeveCapital();
  const carry = carryQuery.data;
  const rebalances = rebalanceQuery.data;
  const capital = capitalQuery.data;
  const tokens = rebalances?.tokens;

  const working = capital ? capital.readyUsd + capital.convertingUsd : null;
  const undrawn = carry?.debt == null ? null : carry.debt - carry.owed;
  const earlier = carry ? carry.earned - carry.costs : null;
  // Left once the interest owed to lenders is paid. Null when the interest itself is unknown.
  const result = rebalances && carry?.interest != null && earlier != null ? rebalances.netUsd + earlier - carry.interest : null;
  const resultLoading = carryQuery.isLoading || rebalanceQuery.isLoading;

  return (
    <div className="space-y-10">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
              {l.label} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </li>
        ))}
      </ul>

      <Section title="Capital for rebalancing"
        intro="Sève's stablecoins go round a loop: into a reserve, out to the issuer, and back. This is where they are now.">
        {capitalQuery.isError && !capital ? (
          <p className="text-sm text-muted-foreground">Capital data unavailable</p>
        ) : (
          <div className={GRID}>
            <Tile label="Working capital" loading={capitalQuery.isLoading} value={usd(working)} note="Ready plus being converted" />
            <Tile label="Ready now" loading={capitalQuery.isLoading} value={usd(capital?.readyUsd)}
              note={holdings(capital?.ready, tokens, "Nothing in the Rebalancer Safe")} />
            <Tile label="Being converted" loading={capitalQuery.isLoading} value={usd(capital?.convertingUsd)}
              note="Sent to the issuer, not back yet" />
            <Tile label="Held back" loading={capitalQuery.isLoading || carryQuery.isLoading}
              value={capital && undrawn != null ? usd(capital.idleUsd + undrawn) : UNKNOWN}
              note={capital && undrawn != null ? `${formatUSD(capital.idleUsd)} in the Borrower Safe, ${formatUSD(undrawn)} not drawn on Wildcat` : "Borrower Safe and undrawn loan"} />
          </div>
        )}
      </Section>

      <Section title="Redeemed and minted"
        intro="Each rebalance takes the over-weight stablecoin out of a reserve and redeems it with its issuer. The stablecoin supplied was minted by its issuer first.">
        {rebalanceQuery.isError && !rebalances ? (
          <p className="text-sm text-muted-foreground">Rebalance data unavailable</p>
        ) : (
          <div className="grid gap-2 sm:gap-3 lg:grid-cols-2">
            <FlowTable title="Redeemed" note="Taken out of Clear and sent to the issuer" side="redeemed" data={rebalances} />
            <FlowTable title="Minted" note="Received from the issuer and supplied to Clear" side="minted" data={rebalances} />
          </div>
        )}
      </Section>

      <Section title="Profit and loss" intro="What the loan costs against what rebalancing earns, since the first loan.">
        {carryQuery.isError && !carry ? (
          <p className="text-sm text-muted-foreground">Loan data unavailable</p>
        ) : (
          <div className={GRID}>
            <Tile label="Wildcat debt" loading={carryQuery.isLoading} value={usd(carry?.debt)}
              note={carry?.principal == null ? "Principal plus interest" : `${formatUSD(carry.principal)} lent plus interest`} />
            <Tile label="Interest to pay" loading={carryQuery.isLoading} value={signed(carry?.interest)} note="Accrued, not paid yet" />
            <Tile label="Made on rebalances" loading={rebalanceQuery.isLoading} value={signed(rebalances?.netUsd)}
              note={rebalances ? `${rebalances.count} rebalances, ${formatUSD(rebalances.volumeUsd)}, after ${rebalances.costBps} bp cost (assumed)` : "After conversion cost"} />
            <Tile label={result != null && result < 0 ? "Loss after interest" : "Profit after interest"} loading={resultLoading} value={signed(result)}
              note={earlier == null ? "Rebalances and earlier carry, less interest" : `Includes ${signed(earlier)} of earlier carry. Reserve shares not counted`} />
          </div>
        )}
      </Section>

      <div className="space-y-2">
        <details className={DETAILS}>
          <summary className={SUMMARY}>Each rebalance</summary>
          <div className="px-4 pb-4"><SeveRebalanceTable /></div>
        </details>
        <details className={DETAILS}>
          <summary className={SUMMARY}>All activity on Clear</summary>
          <div className="px-4 pb-4"><ActivityFeed title="Sève on Clear V1" actors={SAFE_ADDRESSES} /></div>
        </details>
      </div>
    </div>
  );
}
