"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, fallback, formatEther, type Address } from "viem";
import { mainnet } from "viem/chains";
import {
  ORACLE_KEEPER_ADDRESS,
  CHAINLINK_ETH_USD,
  chainlinkAbi,
  ETH_RPC_URL,
  ETH_RPC_FALLBACKS,
} from "@/lib/clear-contracts";
import {
  useKeeperGasFromD1,
  type KeeperGasData,
  type DailyBucket,
} from "@/hooks/use-rebalance-gas";

export interface DailyGasData {
  date: string;
  avgGasCost: number;
  totalGasCost: number;
  transactionCount: number;
}

export interface GasStatistics {
  lastQuery: { gasCostUSD: number; gasUsed: number; gasPrice: number } | null;
  dayAverage: number;
  weekAverage: number;
  monthAverage: number;
  allTimeAverage: number;
  dayDeviation: number;
  weekDeviation: number;
  monthDeviation: number;
  totalTransactions: number;
  dailyData: DailyGasData[];
}

export interface OracleGasMetrics {
  ethBalance: number;
  ethBalanceUSD: number;
  ethPrice: number;

  // Runway — all ETH-denominated so moves in ETH/USD don't distort it.
  expectedRunwayDays: number;
  expectedRunwayHours: number;
  worstCaseRunwayDays: number;
  worstCaseRunwayHours: number;
  minOperationalBalanceETH: number;

  // Baseline used for the expected runway (last 7d of observed keeper txs).
  baseline: {
    txPerHour: number;
    avgCostETH: number;
    avgCostUSD: number;
    txsInWindow: number;
  };

  statistics: GasStatistics;
}

// ── Viem client (balance + ETH price only, no log scanning) ──────────────────

const KEEPER_RPC = process.env.NEXT_PUBLIC_ETH_RPC_URL;

const client = createPublicClient({
  chain: mainnet,
  transport: KEEPER_RPC
    ? http(KEEPER_RPC)
    : fallback([http(ETH_RPC_URL), ...ETH_RPC_FALLBACKS.map((url) => http(url))]),
});

async function fetchChainState(): Promise<{ ethBalance: number; ethPrice: number }> {
  const [balanceWei, ethPriceRaw] = await Promise.all([
    client.getBalance({ address: ORACLE_KEEPER_ADDRESS as Address }),
    client.readContract({
      address: CHAINLINK_ETH_USD as Address,
      abi: chainlinkAbi,
      functionName: "latestAnswer",
    }),
  ]);
  return {
    ethBalance: Number(formatEther(balanceWei)),
    ethPrice: Number(ethPriceRaw) / 1e8,
  };
}

function deriveStatistics(
  data: KeeperGasData,
  dailyBuckets: DailyBucket[],
): GasStatistics {
  const oracle = data.oracle;
  const lastBucket = dailyBuckets[dailyBuckets.length - 1];
  const lastQuery =
    lastBucket && lastBucket.count > 0
      ? {
          gasCostUSD: lastBucket.total_usd / lastBucket.count,
          gasUsed: 0,
          gasPrice: 0,
        }
      : null;

  const txsLast7d = oracle.txsLast7d ?? 0;
  const txsLast30d = oracle.txsLast30d ?? 0;
  const dayAverage = txsLast7d > 0 ? oracle.daily / Math.max(1, txsLast7d / 7) : 0;
  const weekAverage = txsLast7d > 0 ? (oracle.weekly * 7) / txsLast7d : 0;
  const monthAverage = txsLast30d > 0 ? (oracle.monthly * 30) / txsLast30d : 0;
  const allTimeAverage = oracle.avgPerTx;

  const calcDev = (avg: number) =>
    allTimeAverage > 0 ? ((avg - allTimeAverage) / allTimeAverage) * 100 : 0;

  const dailyData: DailyGasData[] = dailyBuckets.map((b) => ({
    date: b.date,
    avgGasCost: b.count > 0 ? b.total_usd / b.count : 0,
    totalGasCost: b.total_usd,
    transactionCount: b.count,
  }));

  return {
    lastQuery,
    dayAverage,
    weekAverage,
    monthAverage,
    allTimeAverage,
    dayDeviation: calcDev(dayAverage),
    weekDeviation: calcDev(weekAverage),
    monthDeviation: calcDev(monthAverage),
    totalTransactions: oracle.totalTxs,
    dailyData,
  };
}

function deriveMetrics(
  chain: { ethBalance: number; ethPrice: number },
  data: KeeperGasData,
  dailyBuckets: DailyBucket[],
): OracleGasMetrics {
  const { ethBalance, ethPrice } = chain;
  const ethBalanceUSD = ethBalance * ethPrice;
  const oracle = data.oracle;

  // Fields added in the Apr 2026 worker bump — fall back to 0 when the server
  // hasn't been redeployed yet so the UI doesn't crash on missing fields.
  const avgCostETH = oracle.avgCostETH7d ?? 0;
  const txPerHour = oracle.txPerHour7d ?? 0;
  const p95CostETH = oracle.p95CostETH30d ?? 0;
  const txsLast7d = oracle.txsLast7d ?? 0;

  const expectedHours =
    avgCostETH > 0 && txPerHour > 0 ? ethBalance / (avgCostETH * txPerHour) : 0;
  const worstCaseHours =
    p95CostETH > 0 && txPerHour > 0 ? ethBalance / (p95CostETH * txPerHour) : 0;

  return {
    ethBalance,
    ethBalanceUSD,
    ethPrice,
    expectedRunwayHours: expectedHours,
    expectedRunwayDays: expectedHours / 24,
    worstCaseRunwayHours: worstCaseHours,
    worstCaseRunwayDays: worstCaseHours / 24,
    minOperationalBalanceETH: p95CostETH,
    baseline: {
      txPerHour,
      avgCostETH,
      avgCostUSD: avgCostETH * ethPrice,
      txsInWindow: txsLast7d,
    },
    statistics: deriveStatistics(data, dailyBuckets),
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useKeeperGas() {
  const d1Query = useKeeperGasFromD1();

  const chainQuery = useQuery({
    queryKey: ["keeper-chain-state"],
    queryFn: fetchChainState,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const data =
    d1Query.data && chainQuery.data
      ? deriveMetrics(chainQuery.data, d1Query.data, d1Query.data.oracleDaily ?? [])
      : undefined;

  return {
    data,
    isLoading: d1Query.isLoading || chainQuery.isLoading,
    isFetching: d1Query.isFetching || chainQuery.isFetching,
    error: d1Query.error ?? chainQuery.error,
    refetch: () => {
      d1Query.refetch();
      chainQuery.refetch();
    },
  };
}
