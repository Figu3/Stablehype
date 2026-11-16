"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { SEVE_ISSUER_TOKENS, SEVE_SAFES } from "@shared/lib/clear-v1-config";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useSeveCapital, useSeveCarry, useSeveConversions, useSeveRebalances,
  type SeveConversions, type SeveHolding, type SeveRebalances,
} from "@/hooks/use-seve";
import { GRID, Section, Tile, UNKNOWN } from "./tiles";
import { formatUSD } from "./format";
import { useNowSeconds } from "./v1/use-now";
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

const PERIODS = [
  { key: "24h", label: "24h", seconds: 86_400 },
  { key: "7d", label: "7d", seconds: 7 * 86_400 },
  { key: "30d", label: "30d", seconds: 30 * 86_400 },
  { key: "90d", label: "90d", seconds: 90 * 86_400 },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

interface Step {
  key: string;
  what: string;
  where: string;
  count: number;
  gave: number;
  got: number;
  gaveToken: string;
  gotToken: string;
}

/**
 * Sève's loop over a period, one line per step: the swap on Clear, then each conversion with an
 * issuer. A rebalance with a bLP leg is left out: a reserve share is not a stablecoin.
 */
function loopSteps(
  rebalances: SeveRebalances | undefined, conversions: SeveConversions | undefined, since: number,
): Step[] {
  const steps = new Map<string, Step>();
  const add = (key: string, what: string, where: string, gaveToken: string, gotToken: string, gave: number, got: number) => {
    const s = steps.get(key) ?? { key, what, where, count: 0, gave: 0, got: 0, gaveToken, gotToken };
    s.count += 1; s.gave += gave; s.got += got;
    steps.set(key, s);
  };
  for (const r of rebalances?.rows ?? []) {
    if (r.timestamp < since || r.grossUsd == null) continue;
    const [a, b] = [tokenLabel(r.tokenIn, rebalances?.tokens), tokenLabel(r.tokenOut, rebalances?.tokens)];
    add(`swap-${a}-${b}`, `Swapped ${a} for ${b}`, "Clear rebalance", a, b, r.amountIn, r.amountOut);
  }
  for (const c of conversions?.conversions ?? []) {
    if (c.timestamp < since) continue;
    const [a, b] = [tokenLabel(c.tokenIn, conversions?.tokens), tokenLabel(c.tokenOut, conversions?.tokens)];
    const what = c.kind === "mint" ? `Minted ${b} with ${a}` : c.kind === "burn" ? `Burnt ${a} for ${b}`
      : c.kind === "swap" ? `Swapped ${a} for ${b}` : `Converted ${a} to ${b}`;
    add(`${c.kind}-${a}-${b}`, what, c.kind === "swap" ? "On the market" : "With the issuer", a, b, c.amountIn, c.amountOut);
  }
  return [...steps.values()];
}

interface NetRow {
  token: string;
  minted: number;
  burnt: number;
  /** Sold on the market: it left Sève but still exists. */
  sold: number;
}

/**
 * Per issuer stablecoin over a period: what Sève minted, what it burnt with the issuer, and what
 * it sold on the market instead. Net minted is minted less burnt: the supply Sève added.
 */
function netMinted(conversions: SeveConversions | undefined, since: number): NetRow[] {
  const rows = new Map<string, NetRow>();
  const row = (address: string) => {
    const token = tokenLabel(address, conversions?.tokens);
    let r = rows.get(token);
    if (!r) rows.set(token, (r = { token, minted: 0, burnt: 0, sold: 0 }));
    return r;
  };
  for (const c of conversions?.conversions ?? []) {
    if (c.timestamp < since) continue;
    if (c.kind === "mint") row(c.tokenOut).minted += c.amountOut;
    if (c.kind === "burn") row(c.tokenIn).burnt += c.amountIn;
    if (c.kind === "swap" && SEVE_ISSUER_TOKENS.includes(c.tokenIn)) row(c.tokenIn).sold += c.amountIn;
  }
  return [...rows.values()];
}

function NetTable({ rows }: { rows: NetRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border bg-card px-4 py-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Net minted</TableHead>
            <TableHead className="text-right">Minted</TableHead>
            <TableHead className="text-right">Burnt</TableHead>
            <TableHead className="text-right">Net minted</TableHead>
            <TableHead className="text-right">Minted / burnt</TableHead>
            <TableHead className="text-right">Sold on the market</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.token}>
              <TableCell>
                <div className="font-medium">{r.token}</div>
                <div className="text-xs text-muted-foreground">Minted less burnt with the issuer. Above 100%, more was minted than burnt</div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{amount(r.minted)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{amount(r.burnt)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums font-semibold">
                {`${r.minted - r.burnt > 0 ? "+" : ""}${amount(r.minted - r.burnt)}`}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{r.burnt > 0 ? `${((r.minted / r.burnt) * 100).toFixed(1)}%` : r.minted > 0 ? "No burn" : UNKNOWN}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{amount(r.sold)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LoopTable({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return <p className="text-sm text-muted-foreground">Nothing in this period</p>;
  return (
    <div className="rounded-xl border bg-card px-4 py-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Step</TableHead>
            <TableHead className="text-right">Gave</TableHead>
            <TableHead className="text-right">Got</TableHead>
            <TableHead className="text-right">Times</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.map((s) => (
            <TableRow key={s.key}>
              <TableCell>
                <div className="font-medium">{s.what}</div>
                <div className="text-xs text-muted-foreground">{s.where}</div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{`${amount(s.gave)} ${s.gaveToken}`}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{`${amount(s.got)} ${s.gotToken}`}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{s.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Sève in three questions: what it can rebalance with, what it swapped, minted and burnt, and what is left after interest. */
export function SeveSection() {
  const carryQuery = useSeveCarry();
  const rebalanceQuery = useSeveRebalances();
  const capitalQuery = useSeveCapital();
  const conversionQuery = useSeveConversions();
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const now = useNowSeconds();
  const since = now - PERIODS.find((p) => p.key === period)!.seconds;
  const steps = loopSteps(rebalanceQuery.data, conversionQuery.data, since);
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

      <Section title="The loop"
        intro="Sève swaps on Clear, mints the issuer's stablecoin with what it received, then burns it or sells it for the stablecoin it supplies next.">
        <ToggleGroup type="single" variant="outline" size="sm" value={period} aria-label="Period"
          onValueChange={(v) => { if (v) setPeriod(v as PeriodKey); }}>
          {PERIODS.map((p) => <ToggleGroupItem key={p.key} value={p.key} className="px-3">{p.label}</ToggleGroupItem>)}
        </ToggleGroup>
        {(rebalanceQuery.isError && !rebalanceQuery.data) || (conversionQuery.isError && !conversionQuery.data) ? (
          <p className="text-sm text-muted-foreground">Loop data unavailable</p>
        ) : rebalanceQuery.isLoading || conversionQuery.isLoading ? (
          <div className="h-32 rounded-xl border bg-muted/30 animate-pulse" />
        ) : (
          <div className="space-y-2 sm:space-y-3">
            <LoopTable steps={steps} />
            <NetTable rows={netMinted(conversionQuery.data, since)} />
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
