"use client";

import { useMemo } from "react";
import Link from "next/link";
import { RefreshCw, Circle, AlertTriangle, Clock, Fuel } from "lucide-react";
import { useClearRoutes, type ClearRoute, type ClearTokenPrice } from "@/hooks/use-clear-routes";
import { ORACLE_DECIMALS } from "@/lib/clear-contracts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(raw: bigint): string {
  const divisor = BigInt(10) ** BigInt(ORACLE_DECIMALS);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(ORACLE_DECIMALS, "0").slice(0, 4);
  return `$${whole}.${fracStr}`;
}

function formatBps(bps: bigint): string {
  const pct = Number(bps) / 100;
  return `${pct.toFixed(2)}%`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ClearRoutes() {
  const { data, isLoading, isFetching, error, refetch } = useClearRoutes();

  const symbols = useMemo(
    () => data?.tokens.map((t) => t.symbol) ?? [],
    [data],
  );

  const routeMap = useMemo(() => {
    const map = new Map<string, ClearRoute>();
    for (const r of data?.routes ?? []) {
      map.set(`${r.from}→${r.to}`, r);
    }
    return map;
  }, [data]);

  const anyStale = data?.tokens.some((t) => t.oracleStale) ?? false;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-5 w-5 text-destructive mb-2" />
        <p className="text-sm text-destructive">Failed to fetch Clear oracle data.</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-xs text-muted-foreground underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return <RouteSkeleton />;
  }

  if (!data) return null;

  const openCount = data.routes.filter((r) => r.open).length;

  return (
    <div className="space-y-4">
      {/* Stale oracle banner */}
      {anyStale && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <Clock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-600 dark:text-amber-400">
            <span className="font-medium">Oracle data is stale.</span>{" "}
            The custom oracle prices have exceeded the on-chain TTL ({data.tokens[0]?.priceTTL ? `${data.tokens[0].priceTTL / 60}min` : "—"}).
            Swap routes are effectively closed until prices are refreshed.
            Cached prices shown below.
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            <span className="font-mono text-foreground">{openCount}</span>
            {" / "}
            <span className="font-mono text-foreground">{data.routes.length}</span>
            {" routes open"}
          </span>
          <span className="text-muted-foreground">
            Depeg threshold:{" "}
            <span className="font-mono text-foreground">{formatBps(data.depegThresholdBps)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/routes/keeper"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Fuel className="h-3 w-3" />
            Keeper Gas
          </Link>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Token prices */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {data.tokens.map((t) => (
          <TokenPriceCard key={t.symbol} token={t} />
        ))}
      </div>

      {/* Route matrix */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left text-muted-foreground font-medium p-2 min-w-[60px]">
                From ↓ / To →
              </th>
              {symbols.map((s) => (
                <th key={s} className="text-center font-medium p-2 min-w-[64px]">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map((from) => (
              <tr key={from} className="border-t border-border/40">
                <td className="font-medium p-2 text-muted-foreground">{from}</td>
                {symbols.map((to) => {
                  if (from === to) {
                    return (
                      <td key={to} className="text-center p-2">
                        <span className="text-muted-foreground/30">—</span>
                      </td>
                    );
                  }
                  const route = routeMap.get(`${from}→${to}`);
                  return (
                    <td key={to} className="text-center p-2">
                      <RouteCell route={route} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
        <span className="inline-flex items-center gap-1">
          <Circle className="h-2.5 w-2.5 fill-emerald-500 text-emerald-500" /> Open
        </span>
        <span className="inline-flex items-center gap-1">
          <Circle className="h-2.5 w-2.5 fill-red-500 text-red-500" /> Closed
        </span>
        <span className="inline-flex items-center gap-1">
          <Circle className="h-2.5 w-2.5 fill-muted-foreground/40 text-muted-foreground/40" /> Stale
        </span>
      </div>

      {data.fetchedAt > 0 && (
        <p className="text-[10px] text-muted-foreground">
          On-chain data from {new Date(data.fetchedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TokenPriceCard({ token }: { token: ClearTokenPrice }) {
  const now = Math.floor(Date.now() / 1000);
  const age = now - token.lastUpdate;

  if (!token.oracleActive) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <div className="text-xs font-medium">{token.symbol}</div>
        <div className="text-xs text-destructive mt-1">Oracle disabled</div>
      </div>
    );
  }

  if (token.oracleStale) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">{token.symbol}</div>
          <Clock className="h-3 w-3 text-amber-500" />
        </div>
        <div className="font-mono text-sm mt-0.5 text-amber-600 dark:text-amber-400">
          {formatPrice(token.price)}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Redemption: {formatPrice(token.redemptionPrice)}
        </div>
        <div className="text-[10px] text-amber-500 mt-1">
          Stale · updated {formatAge(age)}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="text-xs font-medium text-muted-foreground">{token.symbol}</div>
      <div className="font-mono text-sm mt-0.5">{formatPrice(token.price)}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        Redemption: {formatPrice(token.redemptionPrice)}
      </div>
      <div className="text-[10px] text-emerald-500 mt-1">
        Live · updated {formatAge(age)}
      </div>
    </div>
  );
}

function RouteCell({ route }: { route?: ClearRoute }) {
  if (!route) return <span className="text-muted-foreground/30">?</span>;

  if (route.open) {
    return (
      <span title={`${route.from} → ${route.to}: Open`}>
        <Circle className="inline h-3 w-3 fill-emerald-500 text-emerald-500" />
      </span>
    );
  }

  const isStaleIssue = route.reason?.includes("stale");
  return (
    <span title={`${route.from} → ${route.to}: ${route.reason ?? "Closed"}`}>
      <Circle
        className={`inline h-3 w-3 ${
          isStaleIssue
            ? "fill-muted-foreground/40 text-muted-foreground/40"
            : "fill-red-500 text-red-500"
        }`}
      />
    </span>
  );
}

function RouteSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between">
        <div className="h-4 w-40 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="h-48 bg-muted rounded-lg" />
    </div>
  );
}
