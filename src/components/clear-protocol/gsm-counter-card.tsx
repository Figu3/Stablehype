"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { GsmFeesData } from "@/hooks/use-gsm-fees";

const WINDOW_OPTIONS: Array<{ days: number | null; label: string }> = [
  { days: 1, label: "1D" },
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
  { days: 90, label: "90D" },
  { days: null, label: "All" },
];

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export interface GsmCounterCardProps {
  data: GsmFeesData | undefined;
  onReset: () => void;
  isResetting: boolean;
}

export function GsmCounterCard({ data, onReset, isResetting }: GsmCounterCardProps) {
  const [gsmWindowDays, setGsmWindowDays] = useState<number | null>(30);

  return (
    <div className="rounded-xl border border-border/30 bg-muted/10 px-4 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            GSM Fees Owed
          </span>
          <span className="text-sm font-mono font-semibold text-amber-400">
            {data ? `$${data.totalFeesUSD.toFixed(2)}` : "…"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {data ? `${data.rebalanceCount} rebalances` : ""}
          </span>
          {data?.resetAt && (
            <span className="text-[10px] text-muted-foreground">
              · since {new Date(data.resetAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
        <button
          onClick={onReset}
          disabled={isResetting}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title="Reset counter (marks fees as paid)"
        >
          <RotateCcw className={`h-3 w-3 ${isResetting ? "animate-spin" : ""}`} />
          Paid
        </button>
      </div>

      {data?.gsmWindows && data.gsmWindows.length > 0 && (() => {
        const windows = data.gsmWindows;
        const win = windows.find((w) => w.days === gsmWindowDays) ?? windows[windows.length - 1];
        const totalMint = win.mintedUSDC + win.mintedUSDT;
        const totalRedeem = win.redeemedUSDC + win.redeemedUSDT;
        const hasVolume = totalMint > 0 || totalRedeem > 0;
        const ratio = totalRedeem > 0 ? totalMint / totalRedeem : null;
        const ratioColor =
          ratio === null
            ? "text-muted-foreground"
            : ratio > 1.005
              ? "text-emerald-400"
              : ratio < 0.995
                ? "text-amber-400"
                : "text-muted-foreground";

        return (
          <div className="border-t border-border/20 pt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Mint / Redeem Volume
              </span>
              <div className="flex gap-1">
                {WINDOW_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setGsmWindowDays(opt.days)}
                    className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                      gsmWindowDays === opt.days
                        ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-muted-foreground">
                Mint / Redeem ratio
              </span>
              <span className={`text-lg font-mono font-semibold ${ratioColor}`}>
                {ratio === null ? "—" : ratio.toFixed(2)}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground text-right -mt-1.5">
              {fmtVol(totalMint)} minted · {fmtVol(totalRedeem)} redeemed
            </div>

            {hasVolume && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] pt-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Minted w/ USDC</span>
                  <span className="font-mono text-emerald-400/80">{fmtVol(win.mintedUSDC)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Redeemed to USDT</span>
                  <span className="font-mono text-amber-400/80">{fmtVol(win.redeemedUSDT)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Minted w/ USDT</span>
                  <span className="font-mono text-emerald-400/80">{fmtVol(win.mintedUSDT)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Redeemed to USDC</span>
                  <span className="font-mono text-amber-400/80">{fmtVol(win.redeemedUSDC)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
