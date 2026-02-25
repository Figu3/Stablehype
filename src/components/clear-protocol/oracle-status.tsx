import { Circle, Clock } from "lucide-react";
import type { ClearTokenPrice } from "@/hooks/use-clear-routes";
import { formatOraclePrice, formatAge } from "./format";

export function OracleTokenCard({ token }: { token: ClearTokenPrice }) {
  const now = Math.floor(Date.now() / 1000);
  const age = now - token.lastUpdate;

  if (!token.oracleActive) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{token.symbol}</span>
          <span className="text-[10px] text-destructive">Disabled</span>
        </div>
        <div className="font-mono text-sm text-muted-foreground">&mdash;</div>
      </div>
    );
  }

  if (token.oracleStale) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{token.symbol}</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-500">
            <Clock className="h-2.5 w-2.5" />
            Stale
          </span>
        </div>
        <div className="font-mono text-sm text-amber-600 dark:text-amber-400">
          {formatOraclePrice(token.price)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          Redeem: {formatOraclePrice(token.redemptionPrice)}
        </div>
        <div className="text-[10px] text-amber-500">
          Updated {formatAge(age)}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{token.symbol}</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
          <Circle className="h-1.5 w-1.5 fill-emerald-500 text-emerald-500" />
          Live
        </span>
      </div>
      <div className="font-mono text-sm">{formatOraclePrice(token.price)}</div>
      <div className="text-[10px] text-muted-foreground">
        Redeem: {formatOraclePrice(token.redemptionPrice)}
      </div>
      {/* Heartbeat indicator */}
      <div className="flex items-end gap-[2px] h-3">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px] bg-emerald-500/60 h-full"
          />
        ))}
      </div>
      <div className="text-[10px] text-emerald-500">
        Updated {formatAge(age)}
      </div>
    </div>
  );
}
