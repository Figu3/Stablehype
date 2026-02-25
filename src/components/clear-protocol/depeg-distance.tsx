import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { ClearTokenPrice } from "@/hooks/use-clear-routes";
import { ORACLE_DECIMALS } from "@/lib/clear-contracts";
import { formatBps } from "./format";

export function DepegDistanceGauge({
  tokens,
  depegThresholdBps,
}: {
  tokens: ClearTokenPrice[];
  depegThresholdBps: bigint;
}) {
  const tokenDistances = useMemo(() => {
    const denom = BigInt(10) ** BigInt(ORACLE_DECIMALS);
    return tokens
      .filter((t) => t.oracleActive && t.price > BigInt(0))
      .map((t) => {
        const priceRatio = (t.price * BigInt(10000)) / denom;
        const distBps = Number(priceRatio - depegThresholdBps);
        return { symbol: t.symbol, distBps, price: t.price };
      })
      .sort((a, b) => b.distBps - a.distBps);
  }, [tokens, depegThresholdBps]);

  const maxDist = Math.max(...tokenDistances.map((t) => t.distBps), 1);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Distance from the depeg threshold ({formatBps(depegThresholdBps)}). When a token crosses the threshold, swap routes
        open for that token.
      </p>
      <div className="space-y-2">
        {tokenDistances.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground justify-center">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            All oracles disabled &mdash; depeg distance unavailable
          </div>
        ) : (
          tokenDistances.map((t) => {
            const pct = Math.max(0, Math.min(100, (t.distBps / maxDist) * 100));
            const color =
              t.distBps > 80
                ? "bg-emerald-500"
                : t.distBps > 50
                  ? "bg-amber-500"
                  : t.distBps > 0
                    ? "bg-red-500"
                    : "bg-red-600";
            return (
              <div key={t.symbol} className="flex items-center gap-3">
                <span className="w-12 text-xs font-medium text-right font-mono">{t.symbol}</span>
                <div className="flex-1 h-4 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-24 text-xs font-mono text-muted-foreground text-right">
                  {t.distBps > 0 ? `${t.distBps} bps away` : `TRIGGERED`}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Safe (&gt;80 bps)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Watch (50-80 bps)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Near trigger (&lt;50 bps)
        </span>
      </div>
    </div>
  );
}
