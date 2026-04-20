"use client";

import { TrendingUp, TrendingDown, ArrowRight, Gauge, AlertTriangle, Minus } from "lucide-react";
import { useClearRegime, type RegimeToken, type RegimeAllocation } from "@/hooks/use-clear-regime";
import { formatUSD } from "./format";

function bpsColor(bps: number): string {
  if (bps >= 2) return "text-emerald-400";
  if (bps <= -2) return "text-red-400";
  return "text-muted-foreground";
}

function RegimeArrow({ bps }: { bps: number }) {
  if (bps >= 2) return <TrendingUp className="h-3 w-3 text-emerald-400" />;
  if (bps <= -2) return <TrendingDown className="h-3 w-3 text-red-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function formatBpsSigned(bps: number): string {
  if (Math.abs(bps) < 0.1) return "±0.0 bps";
  return `${bps >= 0 ? "+" : ""}${bps.toFixed(1)} bps`;
}

function TokenRegimeChip({ token }: { token: RegimeToken }) {
  const totalEvents = token.aboveCount + token.belowCount;
  const label = token.activeDirection
    ? `${token.activeDirection === "above" ? "ABOVE" : "BELOW"} now`
    : `${totalEvents} events`;
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/30 bg-background/30 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold">{token.symbol}</span>
        <RegimeArrow bps={token.netRegimeBps} />
      </div>
      <div className={`text-xs font-mono ${bpsColor(token.netRegimeBps)}`}>
        {formatBpsSigned(token.netRegimeBps)}
      </div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function AllocationRow({ alloc }: { alloc: RegimeAllocation }) {
  const pct = Math.round(alloc.pct * 100);
  const drift = alloc.driftPctPoints;
  const driftClass =
    drift === null
      ? "text-muted-foreground"
      : Math.abs(drift) < 5
        ? "text-muted-foreground"
        : drift > 0
          ? "text-amber-400"
          : "text-violet-400";
  const driftLabel = drift === null ? "—" : `${drift > 0 ? "+" : ""}${drift.toFixed(1)}pp`;
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/20 last:border-b-0">
      <div className="w-12 text-xs font-semibold">{alloc.symbol}</div>
      <div className="flex-1 relative h-2 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-violet-500/70 rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="w-10 text-right text-xs font-mono">{pct}%</div>
      <div className="w-16 text-right text-xs font-mono text-muted-foreground">
        {formatUSD(alloc.usdAtReference)}
      </div>
      <div className={`w-14 text-right text-[10px] font-mono ${driftClass}`} title="Drift: current vault vs suggested">
        {driftLabel}
      </div>
    </div>
  );
}

export function RegimeBanner() {
  const { data, isLoading, error } = useClearRegime();

  if (isLoading && !data) {
    return <div className="h-48 bg-muted/50 rounded-xl animate-pulse" />;
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <span>Regime data unavailable.</span>
      </div>
    );
  }

  const { tokens, flow, suggested } = data;
  const topRoute = flow.routes[0];
  const hasDrift = suggested.allocations.some(
    (a) => a.driftPctPoints !== null && Math.abs(a.driftPctPoints) >= 10,
  );

  return (
    <div className="space-y-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.03] p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-violet-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Peg Regime & Deposit Tilt
          </h3>
          <span className="text-[10px] text-muted-foreground">
            · rolling {data.windowDays}d
          </span>
        </div>
        {hasDrift && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            vault drift detected
          </span>
        )}
      </div>

      {/* Per-token regime chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tokens.map((t) => (
          <TokenRegimeChip key={t.symbol} token={t} />
        ))}
      </div>

      {/* Dominant flow line */}
      {topRoute && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Dominant flow</span>
          <span className="inline-flex items-center gap-1 font-mono">
            <span className="font-semibold">{topRoute.from}</span>
            <ArrowRight className="h-3 w-3 text-violet-400" />
            <span className="font-semibold">{topRoute.to}</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-violet-400">
            {Math.round(topRoute.sharePct * 100)}% of {formatUSD(flow.totalVolumeUSD)}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-muted-foreground">{flow.totalSwaps} swaps</span>
        </div>
      )}

      {/* Suggested allocation */}
      <div className="rounded-lg border border-border/30 bg-background/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground/80">
            Suggested deposit mix
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            per ${(suggested.referenceTVL / 1000).toFixed(0)}K new TVL
          </span>
        </div>
        <div className="space-y-0">
          {suggested.allocations.map((a) => (
            <AllocationRow key={a.symbol} alloc={a} />
          ))}
        </div>
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/20 text-[10px] text-muted-foreground">
          <span>drift = current vault − suggested (pp)</span>
          <span className="font-mono">
            <span className="text-amber-400">+</span> over ·{" "}
            <span className="text-violet-400">−</span> under
          </span>
        </div>
      </div>

      {/* Narrative */}
      <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
        {suggested.narrative}
      </p>
    </div>
  );
}
