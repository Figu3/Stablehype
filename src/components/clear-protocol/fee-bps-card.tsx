"use client";

import { useState } from "react";
import type { ClearFeeWindow } from "@/hooks/use-clear-fees";

const WINDOW_OPTIONS = [1, 7, 14, 30, 90] as const;

function formatUSD(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatBps(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  if (bps >= 100) return `${bps.toFixed(0)} bps`;
  if (bps >= 10) return `${bps.toFixed(1)} bps`;
  return `${bps.toFixed(2)} bps`;
}

interface FeeBpsCardProps {
  windows: ClearFeeWindow[];
  isLoading: boolean;
}

export function FeeBpsCard({ windows, isLoading }: FeeBpsCardProps) {
  const [selectedDays, setSelectedDays] = useState<number>(7);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Avg Fee per Swap
          </h5>
        </div>
        <div className="h-[140px] bg-muted/50 rounded animate-pulse" />
      </div>
    );
  }

  const w = windows.find((x) => x.days === selectedDays);
  if (!w) return null;

  const noVolume = w.volumeUSD <= 0;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Avg Fee per Swap
        </h5>
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map((d) => (
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

      {/* Hero: total bps */}
      <div className="text-center py-1">
        <div className="text-3xl font-bold font-mono tracking-tight text-violet-400">
          {noVolume ? "—" : formatBps(w.totalBps)}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          volume-weighted · {selectedDays}D
        </div>
      </div>

      {/* Component breakdown */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Treasury fee</span>
          <span className="font-mono text-emerald-400/90">
            {formatBps(w.treasuryBps)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">LP fee</span>
          <span className="font-mono text-emerald-400/90">
            {formatBps(w.lpBps)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Spread</span>
          <span className="font-mono text-emerald-400/90">
            {formatBps(w.spreadBps)}
          </span>
        </div>
      </div>

      {/* Activity footer */}
      <div className="border-t border-border/40 pt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {w.swapCount} swaps · {formatUSD(w.volumeUSD)} vol
        </span>
        <span className="font-mono">
          {formatUSD(w.totalFeeUSD)} earned
        </span>
      </div>
    </div>
  );
}
