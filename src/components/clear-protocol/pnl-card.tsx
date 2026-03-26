"use client";

import { useState } from "react";
import type { PeriodPnL } from "@/hooks/use-clear-pnl";

const PERIOD_OPTIONS = [1, 7, 30, 90] as const;

function formatUSD(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatAPR(apr: number | null): string {
  if (apr === null) return "—";
  return `${apr >= 0 ? "+" : ""}${apr.toFixed(2)}%`;
}

interface PnLCardProps {
  periods: PeriodPnL[];
  tvlUSD: number | null;
  isLoading: boolean;
}

export function PnLCard({ periods, tvlUSD, isLoading }: PnLCardProps) {
  const [selectedDays, setSelectedDays] = useState<number>(7);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Protocol P&L
        </h5>
        <div className="h-[200px] w-full bg-muted/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  const period = periods.find((p) => p.days === selectedDays);
  if (!period) return null;

  const apr =
    tvlUSD && tvlUSD > 0 && selectedDays > 0
      ? (period.totalFeesUSD / tvlUSD) * (365 / selectedDays) * 100
      : null;

  const isPositive = period.totalFeesUSD >= 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Protocol P&L
        </h5>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDays(d)}
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                selectedDays === d
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {/* Total Fees hero */}
      <div className="text-center py-2">
        <div
          className={`text-2xl font-bold font-mono ${
            isPositive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}{formatUSD(period.totalFeesUSD)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {apr !== null ? (
            <span className={apr >= 0 ? "text-emerald-400" : "text-red-400"}>
              {formatAPR(apr)} APR
            </span>
          ) : (
            "APR unavailable"
          )}
          <span className="mx-1.5">·</span>
          {selectedDays}D total
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Swap Fees</span>
          <span className="font-mono text-emerald-400">
            +{formatUSD(period.swapFees.totalUSD)}
          </span>
        </div>
        <div className="flex items-center justify-between pl-3 text-[10px]">
          <span className="text-muted-foreground">Treasury</span>
          <span className="font-mono text-muted-foreground">
            {formatUSD(period.swapFees.treasuryUSD)}
          </span>
        </div>
        <div className="flex items-center justify-between pl-3 text-[10px]">
          <span className="text-muted-foreground">LP</span>
          <span className="font-mono text-muted-foreground">
            {formatUSD(period.swapFees.lpUSD)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Passive Fees</span>
          {period.passiveFeesUSD !== null ? (
            <span className={`font-mono ${period.passiveFeesUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {period.passiveFeesUSD >= 0 ? "+" : ""}{formatUSD(period.passiveFeesUSD)}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">tracking...</span>
          )}
        </div>
        <div className="border-t border-border/40 pt-1.5 flex items-center justify-between font-medium">
          <span className="text-muted-foreground">Total Fees</span>
          <span
            className={`font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}
          >
            {isPositive ? "+" : ""}{formatUSD(period.totalFeesUSD)}
          </span>
        </div>
      </div>

      {/* Activity */}
      <div className="text-[10px] text-muted-foreground text-center pt-1">
        {period.swapCount} swaps · {period.rebalanceCount} rebalances
      </div>
    </div>
  );
}
