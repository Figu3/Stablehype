"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDexLiquidity } from "@/hooks/use-dex-liquidity";
import { formatCurrency } from "@/lib/format";
import type { DexLiquidityPool } from "@/lib/types";

function getScoreTier(score: number): "green" | "blue" | "amber" | "red" {
  if (score >= 80) return "green";
  if (score >= 60) return "blue";
  if (score >= 40) return "amber";
  return "red";
}

const TIER_BORDER = {
  green: "border-l-emerald-500",
  blue: "border-l-blue-500",
  amber: "border-l-amber-500",
  red: "border-l-red-500",
};

const TIER_TEXT = {
  green: "text-emerald-500",
  blue: "text-blue-500",
  amber: "text-amber-500",
  red: "text-red-500",
};

function formatProtocolName(project: string): string {
  const names: Record<string, string> = {
    curve: "Curve",
    "uniswap-v3": "Uniswap V3",
    uniswap: "Uniswap",
    fluid: "Fluid",
    balancer: "Balancer",
    aerodrome: "Aerodrome",
    velodrome: "Velodrome",
    pancakeswap: "PancakeSwap",
    other: "Other",
  };
  return names[project] ?? project;
}

function ProtocolBar({ protocolTvl }: { protocolTvl: Record<string, number> }) {
  const entries = Object.entries(protocolTvl).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) return null;

  const PROTOCOL_COLORS: Record<string, string> = {
    curve: "bg-blue-500",
    "uniswap-v3": "bg-pink-500",
    uniswap: "bg-pink-400",
    fluid: "bg-cyan-500",
    balancer: "bg-violet-500",
    aerodrome: "bg-sky-500",
    velodrome: "bg-red-500",
    pancakeswap: "bg-amber-500",
    other: "bg-muted-foreground",
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Protocol Breakdown</p>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {entries.map(([protocol, tvl]) => {
          const pct = (tvl / total) * 100;
          if (pct < 1) return null;
          return (
            <div
              key={protocol}
              className={`${PROTOCOL_COLORS[protocol] ?? "bg-muted-foreground"}`}
              style={{ width: `${pct}%` }}
              title={`${formatProtocolName(protocol)}: ${formatCurrency(tvl)} (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {entries.slice(0, 5).map(([protocol, tvl]) => (
          <span key={protocol} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${PROTOCOL_COLORS[protocol] ?? "bg-muted-foreground"}`} />
            {formatProtocolName(protocol)} {((tvl / total) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function TopPoolsTable({ pools }: { pools: DexLiquidityPool[] }) {
  if (pools.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Pools</p>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Pool</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Chain</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">TVL</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">24h Vol</th>
              <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">Detail</th>
            </tr>
          </thead>
          <tbody>
            {pools.slice(0, 5).map((pool, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-1.5">
                  <span className="font-medium">{pool.symbol}</span>
                  <span className="text-xs text-muted-foreground ml-1">({pool.project})</span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{pool.chain}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatCurrency(pool.tvlUsd)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums hidden sm:table-cell">{formatCurrency(pool.volumeUsd1d)}</td>
                <td className="px-3 py-1.5 text-right text-xs text-muted-foreground hidden md:table-cell">
                  {pool.extra?.amplificationCoefficient != null && (
                    <span title="Curve amplification coefficient">A={pool.extra.amplificationCoefficient}</span>
                  )}
                  {pool.extra?.feeTier != null && (
                    <span title="Fee tier">{pool.extra.feeTier}bp</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DexLiquidityCard({ stablecoinId }: { stablecoinId: string }) {
  const { data: liquidityMap, isLoading } = useDexLiquidity();

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-l-[3px] border-l-muted">
        <CardHeader className="pb-2">
          <Skeleton className="h-3 w-36" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const liq = liquidityMap?.[stablecoinId];
  if (!liq || (liq.liquidityScore === 0 && liq.poolCount === 0)) return null;

  const score = liq.liquidityScore ?? 0;
  const tier = getScoreTier(score);

  return (
    <Card className={`rounded-2xl border-l-[3px] ${TIER_BORDER[tier]}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle as="h2" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            DEX Liquidity
          </CardTitle>
          <div className={`text-2xl font-bold font-mono ${TIER_TEXT[tier]}`}>
            {score}<span className="text-sm text-muted-foreground">/100</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total TVL</p>
            <p className="text-lg font-bold font-mono tabular-nums">{formatCurrency(liq.totalTvlUsd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">24h Volume</p>
            <p className="text-lg font-bold font-mono tabular-nums">{formatCurrency(liq.totalVolume24hUsd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pools</p>
            <p className="text-lg font-bold font-mono tabular-nums">{liq.poolCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Chains</p>
            <p className="text-lg font-bold font-mono tabular-nums">{liq.chainCount}</p>
          </div>
        </div>

        <ProtocolBar protocolTvl={liq.protocolTvl} />

        <TopPoolsTable pools={liq.topPools} />
      </CardContent>
    </Card>
  );
}
