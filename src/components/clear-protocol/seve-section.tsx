"use client";

import { ExternalLink } from "lucide-react";
import { SEVE_SAFES } from "@shared/lib/clear-v1-config";
import { useSeveCarry, useSeveRebalances } from "@/hooks/use-seve";
import { GRID, Section, Tile, UNKNOWN } from "./tiles";
import { formatUSD } from "./format";
import { ActivityFeed } from "./v1/activity-feed";
import { money } from "./v1/helpers";
import { SeveRebalanceTable } from "./v1/seve-rebalance-gains";

const WILDCAT_MARKET = "https://plasmascan.to/address/0x74c7861c3e706e7299654f89a3c0091184aa10f0";
const SAFE_ADDRESSES = SEVE_SAFES.map((s) => s.address);
const LINKS = [
  ...SEVE_SAFES.map((s) => ({ label: s.label, href: `https://etherscan.io/address/${s.address}` })),
  { label: "Wildcat market", href: WILDCAT_MARKET },
];

const usd = (v: number | null | undefined) => (v == null ? UNKNOWN : formatUSD(v));
const signed = (v: number | null | undefined) => (v == null ? UNKNOWN : `${v < 0 ? "-" : ""}${money(Math.abs(v))}`);
const DETAILS = "group rounded-xl border bg-card";
const SUMMARY = "cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground";

/** Sève in three blocks: what it borrowed, what rebalancing Clear earns it, and the detail behind it. */
export function SeveSection() {
  const carryQuery = useSeveCarry();
  const rebalanceQuery = useSeveRebalances();
  const carry = carryQuery.data;
  const rebalances = rebalanceQuery.data;
  const unpriced = rebalances ? rebalances.count - rebalances.pricedCount : 0;

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

      <Section title="Loan" intro="A Wildcat credit line on Plasma, read live.">
        {carryQuery.isError && !carry ? (
          <p className="text-sm text-muted-foreground">Loan data unavailable</p>
        ) : (
          <div className={GRID}>
            <Tile label="Lent to Sève" loading={carryQuery.isLoading} value={usd(carry?.principal)} note="Principal from lenders" />
            <Tile label="Drawn" loading={carryQuery.isLoading} value={usd(carry?.owed)} note="The rest sits in the market" />
            <Tile label="Interest accrued" loading={carryQuery.isLoading} value={signed(carry?.interest)} note="Since the first loan" />
            <Tile label="Earlier carry" loading={carryQuery.isLoading}
              value={carry ? signed(carry.earned - carry.costs) : UNKNOWN} note="Morpho, Merkl, yzSyrup. Closed 27 Oct" />
          </div>
        )}
      </Section>

      <Section title="Rebalancing Clear"
        intro="Sève takes the over-weight stablecoin out of a reserve at its redemption value, then converts it 1:1 with the issuer.">
        <div className={GRID}>
          <Tile label="Rebalanced" loading={rebalanceQuery.isLoading} value={usd(rebalances?.volumeUsd)} note="Supplied to Clear, at par" />
          <Tile label="Rebalances" loading={rebalanceQuery.isLoading} value={rebalances ? String(rebalances.count) : UNKNOWN}
            note={unpriced ? `${unpriced} with a bLP leg, not priced` : "By Sève's Safes"} />
          <Tile label="Received above par" loading={rebalanceQuery.isLoading} value={signed(rebalances?.grossUsd)}
            note={rebalances?.grossBps == null ? "Units out less units in" : `${rebalances.grossBps.toFixed(1)} bps of what was supplied`} />
          <Tile label="Conversion gain" loading={rebalanceQuery.isLoading} value={signed(rebalances?.netUsd)}
            note={rebalances ? `After ${rebalances.costBps} bp conversion cost (assumed)` : "After conversion cost"} />
        </div>
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
