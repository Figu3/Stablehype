"use client";

import { useMemo } from "react";
import { Shield, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useClearRoutes } from "@/hooks/use-clear-routes";
import { useKeeperGas } from "@/hooks/use-keeper-gas";
import { useVaultTVL } from "@/hooks/use-vault-tvl";
import { ORACLE_DECIMALS } from "@/lib/clear-contracts";

import { HealthBanner } from "./health-banner";
import { KPICard } from "./kpi-card";
import { OracleTokenCard } from "./oracle-status";
import { RouteMatrix } from "./route-matrix";
import { KeeperSummary } from "./keeper-summary";
import { DepegDistanceGauge } from "./depeg-distance";
import { formatUSD } from "./format";

export function ClearProtocolPanel() {
  const queryClient = useQueryClient();
  const routesQuery = useClearRoutes();
  const keeperQuery = useKeeperGas();
  const vaultQuery = useVaultTVL();

  // Derived metrics
  const derived = useMemo(() => {
    const tokens = routesQuery.data?.tokens ?? [];
    const routes = routesQuery.data?.routes ?? [];

    const openCount = routes.filter((r) => r.open).length;
    const anyStale = tokens.some((t) => t.oracleActive && t.oracleStale);
    const activeDepegs = routes.filter((r) => r.open).length > 0;

    // Distance to depeg threshold for active tokens
    const denom = BigInt(10) ** BigInt(ORACLE_DECIMALS);
    const depegThresholdBps = routesQuery.data?.depegThresholdBps ?? BigInt(9900);

    const activeTokens = tokens.filter((t) => t.oracleActive && t.price > BigInt(0));
    const closestToken = activeTokens.reduce<{ symbol: string; distBps: number } | null>(
      (closest, t) => {
        const priceRatio = (t.price * BigInt(10000)) / denom;
        const distBps = Number(priceRatio - depegThresholdBps);
        if (!closest || distBps < closest.distBps) {
          return { symbol: t.symbol, distBps };
        }
        return closest;
      },
      null,
    );

    // Freshest oracle update
    const now = Math.floor(Date.now() / 1000);
    const freshestUpdate = activeTokens.reduce((min, t) => {
      const age = now - t.lastUpdate;
      return age < min ? age : min;
    }, Infinity);
    const oracleAge = freshestUpdate === Infinity ? null : freshestUpdate;

    const isHealthy = !activeDepegs && !anyStale;

    return {
      openCount,
      totalRoutes: routes.length,
      anyStale,
      activeDepegs,
      closestToken,
      oracleAge,
      isHealthy,
      depegThresholdBps,
    };
  }, [routesQuery.data]);

  const isLoading =
    routesQuery.isLoading ||
    routesQuery.isFetching ||
    keeperQuery.isLoading ||
    keeperQuery.isFetching ||
    vaultQuery.isLoading ||
    vaultQuery.isFetching;

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["clear-routes"] });
    queryClient.invalidateQueries({ queryKey: ["keeper-gas"] });
    queryClient.invalidateQueries({ queryKey: ["clear-vault-tvl"] });
  };

  const tokens = routesQuery.data?.tokens ?? [];
  const routes = routesQuery.data?.routes ?? [];

  return (
    <section className="space-y-4 rounded-2xl border border-border/50 bg-muted/10 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-violet-500" />
          <h2 className="text-lg font-semibold tracking-tight">Clear Protocol</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            LIVE
          </span>
        </div>
        <button
          onClick={handleRefreshAll}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Health Banner */}
      <HealthBanner
        isLoading={routesQuery.isLoading && !routesQuery.data}
        isHealthy={derived.isHealthy}
        anyStale={derived.anyStale}
        openCount={derived.openCount}
        totalRoutes={derived.totalRoutes}
        oracleAge={derived.oracleAge}
        runwayDays={keeperQuery.data?.expectedRunwayDays ?? null}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3">
        <KPICard
          label="Vault TVL"
          value={vaultQuery.data ? formatUSD(vaultQuery.data.tvlUSD) : null}
          sub="ERC-4626 vault deposits"
          accent="blue"
          isLoading={vaultQuery.isLoading && !vaultQuery.data}
        />
        <KPICard
          label="Active Depegs"
          value={routesQuery.data ? String(derived.openCount > 0 ? 1 : 0) : null}
          sub={
            derived.closestToken
              ? `Closest: ${derived.closestToken.symbol} (${derived.closestToken.distBps} bps)`
              : "All tokens at peg"
          }
          accent="emerald"
          isLoading={routesQuery.isLoading && !routesQuery.data}
          isZeroGood
        />
      </div>

      {/* Oracle Status + Route Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        {/* Oracle cards */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Oracle Status
          </h3>
          {routesQuery.isLoading && !routesQuery.data ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-28 bg-muted/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {tokens.map((t) => (
                <OracleTokenCard key={t.symbol} token={t} />
              ))}
            </div>
          )}
        </div>

        {/* Route matrix */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Swap Routes
          </h3>
          {routesQuery.isLoading && !routesQuery.data ? (
            <div className="h-48 w-64 bg-muted/50 rounded-xl animate-pulse" />
          ) : (
            <RouteMatrix
              routes={routes}
              tokens={tokens}
              depegThresholdBps={derived.depegThresholdBps}
            />
          )}
        </div>
      </div>

      {/* Keeper + Depeg Distance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Keeper Economics
          </h3>
          {keeperQuery.isLoading && !keeperQuery.data ? (
            <div className="h-56 bg-muted/50 rounded-xl animate-pulse" />
          ) : keeperQuery.data ? (
            <KeeperSummary data={keeperQuery.data} />
          ) : null}
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Depeg Distance
          </h3>
          {routesQuery.isLoading && !routesQuery.data ? (
            <div className="h-56 bg-muted/50 rounded-xl animate-pulse" />
          ) : (
            <DepegDistanceGauge
              tokens={tokens}
              depegThresholdBps={derived.depegThresholdBps}
            />
          )}
        </div>
      </div>
    </section>
  );
}
