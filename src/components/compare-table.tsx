"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StablecoinLogo } from "@/components/stablecoin-logo";
import { TierBadge } from "@/components/tier-badge";
import { getStablecoinTier } from "@/lib/tiers";
import { formatCurrency, formatNativePrice, formatPercentChange, formatWorstDeviation } from "@/lib/format";
import { getCirculatingUSD, getPrevDayUSD, getPrevWeekUSD } from "@/lib/supply";
import { derivePegRates, getPegReference } from "@shared/lib/peg-rates";
import { findStablecoinMeta, TRACKED_STABLECOINS } from "@shared/lib/stablecoins";
import { GRADE_ORDER } from "@shared/lib/bluechip";
import type {
  StablecoinData,
  PegSummaryResponse,
  BluechipRatingsMap,
  DexLiquidityMap,
} from "@shared/lib/types";
import type { CsiResponse } from "@shared/lib/csi-types";

interface CompareTableProps {
  ids: string[];
  peggedAssets: StablecoinData[] | undefined;
  fxFallbackRates: Record<string, number> | undefined;
  logos: Record<string, string> | undefined;
  pegSummary: PegSummaryResponse | undefined;
  bluechipRatings: BluechipRatingsMap | null | undefined;
  csiData: CsiResponse | null | undefined;
  dexLiquidity: DexLiquidityMap | undefined;
}

const GOVERNANCE_STYLE: Record<string, { label: string; cls: string }> = {
  centralized: { label: "Centralized", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  "centralized-dependent": { label: "CeFi-Dependent", cls: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  decentralized: { label: "Decentralized", cls: "bg-green-500/10 text-green-500 border-green-500/20" },
};

const BACKING_STYLE: Record<string, { label: string; cls: string }> = {
  "rwa-backed": { label: "RWA-Backed", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  "crypto-backed": { label: "Crypto-Backed", cls: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  algorithmic: { label: "Algorithmic", cls: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
};

const PEG_STYLE: Record<string, { label: string; cls: string }> = {
  USD: { label: "USD", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  EUR: { label: "EUR", cls: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  GOLD: { label: "Gold", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  CHF: { label: "CHF", cls: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  GBP: { label: "GBP", cls: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
  BRL: { label: "BRL", cls: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  RUB: { label: "RUB", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
  VAR: { label: "Variable", cls: "bg-sky-500/10 text-sky-500 border-sky-500/20" },
  OTHER: { label: "Other", cls: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
};

const GRADE_COLORS: Record<string, string> = {
  "A+": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  A: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "A-": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "B+": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  B: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "B-": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "C+": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  C: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "C-": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  D: "bg-red-500/10 text-red-500 border-red-500/20",
  F: "bg-red-500/10 text-red-500 border-red-500/20",
};

const DASH = <span className="text-muted-foreground">—</span>;

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

/** Returns the set of coin ids sharing the best (max) value among the given entries. */
function bestIds(entries: { id: string; value: number | null }[]): Set<string> {
  const valid = entries.filter((e): e is { id: string; value: number } => e.value !== null);
  if (valid.length < 2) return new Set();
  const max = Math.max(...valid.map((e) => e.value));
  if (valid.every((e) => e.value === max)) return new Set();
  return new Set(valid.filter((e) => e.value === max).map((e) => e.id));
}

function SectionHeader({ label, span }: { label: string; span: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={span}
        className="bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground py-2"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

export function CompareTable({
  ids,
  peggedAssets,
  fxFallbackRates,
  logos,
  pegSummary,
  bluechipRatings,
  csiData,
  dexLiquidity,
}: CompareTableProps) {
  const pegRates = useMemo(() => {
    const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
    return derivePegRates(peggedAssets ?? [], metaById, fxFallbackRates);
  }, [peggedAssets, fxFallbackRates]);

  const coins = useMemo(() => {
    return ids
      .map((id) => {
        const meta = findStablecoinMeta(id);
        if (!meta) return null;
        const coinData = peggedAssets?.find((c) => c.id === id);
        const pegEntry = pegSummary?.coins.find((c) => c.id === id);
        const bluechip = bluechipRatings?.[id];
        const csi = csiData?.coins?.[id];
        const dex = dexLiquidity?.[id];
        const tier = getStablecoinTier(id);
        return { id, meta, coinData, pegEntry, bluechip, csi, dex, tier };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [ids, peggedAssets, pegSummary, bluechipRatings, csiData, dexLiquidity]);

  if (coins.length === 0) return null;

  const colSpan = coins.length + 1;

  const pegScoreBest = bestIds(coins.map((c) => ({ id: c.id, value: c.pegEntry?.pegScore ?? null })));
  const liquidityBest = bestIds(coins.map((c) => ({ id: c.id, value: c.dex?.liquidityScore ?? null })));
  const csiBest = bestIds(coins.map((c) => ({ id: c.id, value: c.csi?.score ?? null })));
  const bluechipBest = bestIds(
    coins.map((c) => ({ id: c.id, value: c.bluechip ? GRADE_ORDER[c.bluechip.grade] ?? null : null }))
  );

  return (
    <div className="rounded-2xl border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40 min-w-[10rem]">Metric</TableHead>
            {coins.map(({ id, meta, tier }) => (
              <TableHead key={id} className="min-w-[170px] py-3">
                <Link href={`/stablecoin/${id}/`} className="flex flex-col gap-1.5 hover:opacity-80 transition-opacity">
                  <div className="flex items-center gap-2">
                    <StablecoinLogo src={logos?.[id]} name={meta.name} size={22} />
                    <span className="font-semibold text-foreground">{meta.symbol}</span>
                  </div>
                  <span className="text-xs font-normal text-muted-foreground truncate">{meta.name}</span>
                  {tier && <TierBadge tier={tier} size="sm" />}
                </Link>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* ── Market ──────────────────────────────────────── */}
          <SectionHeader label="Market" span={colSpan} />

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Price</TableCell>
            {coins.map(({ id, meta, coinData }) => {
              if (!coinData) return <TableCell key={id} className="font-mono tabular-nums">{DASH}</TableCell>;
              const pegRef = getPegReference(coinData.pegType, pegRates, meta.goldOunces);
              return (
                <TableCell key={id} className="font-mono tabular-nums">
                  {formatNativePrice(coinData.price, meta.flags.pegCurrency, pegRef)}
                </TableCell>
              );
            })}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Market Cap</TableCell>
            {coins.map(({ id, coinData }) => (
              <TableCell key={id} className="font-mono tabular-nums">
                {coinData ? formatCurrency(getCirculatingUSD(coinData, pegRates)) : DASH}
              </TableCell>
            ))}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Supply Change (24h)</TableCell>
            {coins.map(({ id, coinData }) => {
              if (!coinData) return <TableCell key={id} className="font-mono tabular-nums">{DASH}</TableCell>;
              const mcap = getCirculatingUSD(coinData, pegRates);
              const prev = getPrevDayUSD(coinData, pegRates);
              if (prev <= 0) return <TableCell key={id} className="font-mono tabular-nums">{DASH}</TableCell>;
              return (
                <TableCell key={id} className={`font-mono tabular-nums ${mcap >= prev ? "text-green-500" : "text-red-500"}`}>
                  {formatPercentChange(mcap, prev)}
                </TableCell>
              );
            })}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Supply Change (7d)</TableCell>
            {coins.map(({ id, coinData }) => {
              if (!coinData) return <TableCell key={id} className="font-mono tabular-nums">{DASH}</TableCell>;
              const mcap = getCirculatingUSD(coinData, pegRates);
              const prev = getPrevWeekUSD(coinData, pegRates);
              if (prev <= 0) return <TableCell key={id} className="font-mono tabular-nums">{DASH}</TableCell>;
              return (
                <TableCell key={id} className={`font-mono tabular-nums ${mcap >= prev ? "text-green-500" : "text-red-500"}`}>
                  {formatPercentChange(mcap, prev)}
                </TableCell>
              );
            })}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Chains</TableCell>
            {coins.map(({ id, coinData }) => (
              <TableCell key={id} className="font-mono tabular-nums">
                {coinData?.chains ? coinData.chains.length : DASH}
              </TableCell>
            ))}
          </TableRow>

          {/* ── Peg ─────────────────────────────────────────── */}
          <SectionHeader label="Peg" span={colSpan} />

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Current Deviation</TableCell>
            {coins.map(({ id, pegEntry }) => (
              <TableCell key={id} className="font-mono tabular-nums">
                {pegEntry?.currentDeviationBps != null ? formatWorstDeviation(pegEntry.currentDeviationBps) : DASH}
              </TableCell>
            ))}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Peg Score</TableCell>
            {coins.map(({ id, pegEntry }) => (
              <TableCell
                key={id}
                className={`font-mono tabular-nums ${pegScoreBest.has(id) ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}`}
              >
                {pegEntry?.pegScore != null ? `${pegEntry.pegScore}/100` : DASH}
              </TableCell>
            ))}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Active Depeg</TableCell>
            {coins.map(({ id, pegEntry }) => (
              <TableCell key={id}>
                {pegEntry ? (
                  <Badge
                    label={pegEntry.activeDepeg ? "Active" : "None"}
                    cls={
                      pegEntry.activeDepeg
                        ? "bg-red-500/10 text-red-500 border-red-500/20"
                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    }
                  />
                ) : (
                  DASH
                )}
              </TableCell>
            ))}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Depeg Events</TableCell>
            {coins.map(({ id, pegEntry }) => (
              <TableCell key={id} className="font-mono tabular-nums">
                {pegEntry ? pegEntry.eventCount : DASH}
              </TableCell>
            ))}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Worst Deviation</TableCell>
            {coins.map(({ id, pegEntry }) => (
              <TableCell key={id} className="font-mono tabular-nums">
                {pegEntry?.worstDeviationBps != null ? formatWorstDeviation(pegEntry.worstDeviationBps) : DASH}
              </TableCell>
            ))}
          </TableRow>

          {/* ── Safety ──────────────────────────────────────── */}
          <SectionHeader label="Safety" span={colSpan} />

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Bluechip Grade</TableCell>
            {coins.map(({ id, bluechip }) => (
              <TableCell key={id} className={bluechipBest.has(id) ? "font-semibold" : undefined}>
                {bluechip ? (
                  <Badge
                    label={bluechip.grade}
                    cls={`${GRADE_COLORS[bluechip.grade] ?? "bg-muted text-muted-foreground border-border"} ${
                      bluechipBest.has(id) ? "ring-1 ring-emerald-500/40" : ""
                    }`}
                  />
                ) : (
                  DASH
                )}
              </TableCell>
            ))}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">CSI Score</TableCell>
            {coins.map(({ id, csi }) => (
              <TableCell
                key={id}
                className={`font-mono tabular-nums ${csiBest.has(id) ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}`}
              >
                {csi?.score != null ? `${csi.score} (${csi.grade})` : DASH}
              </TableCell>
            ))}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">DEX Liquidity Score</TableCell>
            {coins.map(({ id, dex }) => (
              <TableCell
                key={id}
                className={`font-mono tabular-nums ${liquidityBest.has(id) ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}`}
              >
                {dex?.liquidityScore != null ? `${Math.round(dex.liquidityScore)}/100` : DASH}
              </TableCell>
            ))}
          </TableRow>

          {/* ── Classification ──────────────────────────────── */}
          <SectionHeader label="Classification" span={colSpan} />

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Type / Governance</TableCell>
            {coins.map(({ id, meta }) => {
              const gov = GOVERNANCE_STYLE[meta.flags.governance];
              return <TableCell key={id}>{gov ? <Badge label={gov.label} cls={gov.cls} /> : DASH}</TableCell>;
            })}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Backing</TableCell>
            {coins.map(({ id, meta }) => {
              const backing = BACKING_STYLE[meta.flags.backing];
              return <TableCell key={id}>{backing ? <Badge label={backing.label} cls={backing.cls} /> : DASH}</TableCell>;
            })}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Peg Currency</TableCell>
            {coins.map(({ id, meta }) => {
              const peg = PEG_STYLE[meta.flags.pegCurrency];
              return <TableCell key={id}>{peg ? <Badge label={peg.label} cls={peg.cls} /> : DASH}</TableCell>;
            })}
          </TableRow>

          <TableRow>
            <TableCell className="text-sm text-muted-foreground">Yield-Bearing</TableCell>
            {coins.map(({ id, meta }) => (
              <TableCell key={id}>
                {meta.flags.yieldBearing ? (
                  <Badge label="Yield-Bearing" cls="bg-emerald-500/10 text-emerald-500 border-emerald-500/20" />
                ) : (
                  DASH
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
