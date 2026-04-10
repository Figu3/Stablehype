"use client";

import { useMemo, useState } from "react";
import { Shield, RefreshCw, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useClearRoutes } from "@/hooks/use-clear-routes";
import { useKeeperGas } from "@/hooks/use-keeper-gas";
import { useVaultTVL } from "@/hooks/use-vault-tvl";
import { useVaultComposition } from "@/hooks/use-vault-composition";
import { useSwapVolume, useSwapVolumeBySource } from "@/hooks/use-swap-volume";
import { useRebalanceVolume, useRebalanceVolumeByType } from "@/hooks/use-rebalance-volume";
import { useGsmFees, useGsmFeesReset } from "@/hooks/use-gsm-fees";
import { useClearPnL } from "@/hooks/use-clear-pnl";
import { ORACLE_DECIMALS } from "@/lib/clear-contracts";

import { HealthBanner } from "./health-banner";
import { KPICard } from "./kpi-card";
import { OracleTokenCard } from "./oracle-status";
import { RouteMatrix } from "./route-matrix";
import { KeeperSummary } from "./keeper-summary";
import { PoolComposition } from "./pool-composition";
import { VolumeChart, type VolumeRange, type VolumeType } from "./swap-volume-chart";
import { PnLCard } from "./pnl-card";
import { formatUSD } from "./format";

export function ClearProtocolPanel() {
  const queryClient = useQueryClient();
  const [volumeRange, setVolumeRange] = useState<VolumeRange>(7);
  const [volumeToken, setVolumeToken] = useState<string | null>(null);
  const [volumeType, setVolumeType] = useState<VolumeType>("swap");
  const routesQuery = useClearRoutes();
  const keeperQuery = useKeeperGas();
  const vaultQuery = useVaultTVL();
  const compositionQuery = useVaultComposition();
  const swapVolumeQuery = useSwapVolume(volumeRange, volumeToken);
  const rebalanceQuery = useRebalanceVolume(volumeRange, volumeToken);
  const swapBySourceQuery = useSwapVolumeBySource(volumeRange, volumeToken);
  const rebalanceByTypeQuery = useRebalanceVolumeByType(volumeRange, volumeToken);
  const gsmFeesQuery = useGsmFees();
  const pnlQuery = useClearPnL();
  const gsmFeesReset = useGsmFeesReset();

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
    vaultQuery.isFetching ||
    swapVolumeQuery.isLoading ||
    swapVolumeQuery.isFetching ||
    rebalanceQuery.isLoading ||
    rebalanceQuery.isFetching ||
    swapBySourceQuery.isLoading ||
    swapBySourceQuery.isFetching ||
    rebalanceByTypeQuery.isLoading ||
    rebalanceByTypeQuery.isFetching;

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["clear-routes"] });
    queryClient.invalidateQueries({ queryKey: ["keeper-gas"] });
    queryClient.invalidateQueries({ queryKey: ["clear-vault-tvl"] });
    queryClient.invalidateQueries({ queryKey: ["clear-vault-composition"] });
    queryClient.invalidateQueries({ queryKey: ["clear-swap-volume"] });
    queryClient.invalidateQueries({ queryKey: ["clear-rebalance-volume"] });
    queryClient.invalidateQueries({ queryKey: ["clear-swap-volume-by-source"] });
    queryClient.invalidateQueries({ queryKey: ["clear-rebalance-volume-by-type"] });
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KPICard
          label="Vault TVL"
          value={(() => {
            const base = vaultQuery.data && vaultQuery.data.tvlUSD > 0
              ? vaultQuery.data.tvlUSD
              : pnlQuery.data?.latestTotalAssetsUSD ?? null;
            if (base === null) return null;
            const gsmOwed = gsmFeesQuery.data?.totalFeesUSD ?? 0;
            return formatUSD(base + gsmOwed);
          })()}
          sub={
            vaultQuery.data && vaultQuery.data.tvlUSD > 0
              ? "Vault + GSM fees owed"
              : pnlQuery.data?.latestTotalAssetsUSD
                ? "Snapshot + GSM fees owed"
                : "ERC-4626 vault deposits"
          }
          accent="blue"
          isLoading={(vaultQuery.isLoading && !vaultQuery.data) && (pnlQuery.isLoading && !pnlQuery.data)}
        />
        <KPICard
          label={`${volumeRange}D Swap Volume`}
          value={swapVolumeQuery.data ? formatUSD(swapVolumeQuery.data.volumeUSD) : null}
          sub={swapVolumeQuery.data ? `${swapVolumeQuery.data.swapCount} swaps` : "Loading…"}
          accent="violet"
          isLoading={swapVolumeQuery.isLoading && !swapVolumeQuery.data}
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

      {/* GSM Fees Counter */}
      <div className="rounded-xl border border-border/30 bg-muted/10 px-4 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              GSM Fees Owed
            </span>
            <span className="text-sm font-mono font-semibold text-amber-400">
              {gsmFeesQuery.data ? `$${gsmFeesQuery.data.totalFeesUSD.toFixed(2)}` : "…"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {gsmFeesQuery.data
                ? `${gsmFeesQuery.data.rebalanceCount} rebalances`
                : ""}
            </span>
            {gsmFeesQuery.data?.resetAt && (
              <span className="text-[10px] text-muted-foreground">
                · since {new Date(gsmFeesQuery.data.resetAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              const key = prompt("Admin key to reset GSM fees counter:");
              if (key) gsmFeesReset.mutate(key);
            }}
            disabled={gsmFeesReset.isPending}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Reset counter (marks fees as paid)"
          >
            <RotateCcw className={`h-3 w-3 ${gsmFeesReset.isPending ? "animate-spin" : ""}`} />
            Paid
          </button>
        </div>
        {gsmFeesQuery.data && (gsmFeesQuery.data.gsmMintedWithUSDC > 0 || gsmFeesQuery.data.gsmMintedWithUSDT > 0) && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] border-t border-border/20 pt-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Minted w/ USDC</span>
              <span className="font-mono text-emerald-400/80">${(gsmFeesQuery.data.gsmMintedWithUSDC / 1000).toFixed(0)}K</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Redeemed to USDT</span>
              <span className="font-mono text-amber-400/80">${(gsmFeesQuery.data.gsmRedeemedToUSDT / 1000).toFixed(0)}K</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Minted w/ USDT</span>
              <span className="font-mono text-emerald-400/80">${(gsmFeesQuery.data.gsmMintedWithUSDT / 1000).toFixed(0)}K</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Redeemed to USDC</span>
              <span className="font-mono text-amber-400/80">${(gsmFeesQuery.data.gsmRedeemedToUSDC / 1000).toFixed(0)}K</span>
            </div>
          </div>
        )}
      </div>

      {/* Pool Composition */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pool Composition
        </h3>
        {compositionQuery.isLoading && !compositionQuery.data ? (
          <div className="h-36 bg-muted/50 rounded-xl animate-pulse" />
        ) : compositionQuery.data ? (
          <PoolComposition
            tokens={compositionQuery.data.tokens}
            totalAssets={compositionQuery.data.totalAssets}
          />
        ) : null}
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

      {/* Volume Chart (stacked: swaps + rebalances) */}
      {swapVolumeQuery.isLoading && !swapVolumeQuery.data ? (
        <div className="h-48 bg-muted/50 rounded-xl animate-pulse" />
      ) : swapVolumeQuery.data?.daily ? (
        <VolumeChart
          swapData={swapVolumeQuery.data.daily}
          rebalanceData={rebalanceQuery.data?.daily}
          swapBySourceData={swapBySourceQuery.data?.daily}
          rebalanceByTypeData={rebalanceByTypeQuery.data?.daily}
          range={volumeRange}
          onRangeChange={setVolumeRange}
          tokenFilter={volumeToken}
          onTokenFilterChange={setVolumeToken}
          volumeType={volumeType}
          onVolumeTypeChange={setVolumeType}
          pnlSlot={
            <PnLCard
              periods={pnlQuery.data?.periods ?? []}
              tvlUSD={(() => {
                const base = (vaultQuery.data && vaultQuery.data.tvlUSD > 0)
                  ? vaultQuery.data.tvlUSD
                  : pnlQuery.data?.latestTotalAssetsUSD ?? null;
                if (base === null) return null;
                return base + (gsmFeesQuery.data?.totalFeesUSD ?? 0);
              })()}
              isLoading={pnlQuery.isLoading && !pnlQuery.data}
            />
          }
        />
      ) : null}

      {/* Keeper Economics */}
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
    </section>
  );
}
