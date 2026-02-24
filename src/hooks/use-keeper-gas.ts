"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPublicClient, http, formatEther, type Hash, type Address } from "viem";
import { mainnet } from "viem/chains";
import {
  ETH_RPC_URL,
  CLEAR_ORACLE_ADDRESS,
  CLEAR_ORACLE_V01_ADDRESS,
  ORACLE_KEEPER_ADDRESS,
  CHAINLINK_ETH_USD,
  chainlinkAbi,
} from "@/lib/clear-contracts";

// ClearOracleRateChanged(address,uint256,uint256) event ABI
const priceUpdateEvent = {
  type: "event",
  name: "ClearOracleRateChanged",
  inputs: [
    { name: "token", type: "address", indexed: false },
    { name: "oldPrice", type: "uint256", indexed: false },
    { name: "newPrice", type: "uint256", indexed: false },
  ],
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface OracleTransaction {
  hash: string;
  blockNumber: number;
  timestamp: number;
  gasUsed: number;
  gasPrice: number; // gwei
  gasCostETH: number;
  gasCostUSD: number;
}

export interface DailyGasData {
  date: string;
  avgGasCost: number;
  totalGasCost: number;
  transactionCount: number;
}

export interface GasStatistics {
  lastQuery: OracleTransaction | null;
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
  expectedRunwayDays: number;
  expectedRunwayHours: number;
  statistics: GasStatistics;
  ethPrice: number;
}

// ── Viem client (singleton, same RPC as routes hook) ─────────────────────────

const client = createPublicClient({
  chain: mainnet,
  transport: http(ETH_RPC_URL),
});

// ── localStorage cache ───────────────────────────────────────────────────────

const STORAGE_KEY = "clear_keeper_gas_v2";

interface StoredData {
  transactions: OracleTransaction[];
  lastProcessedBlock: number;
  lastUpdated: number;
}

function loadCache(): StoredData {
  if (typeof window === "undefined") {
    return { transactions: [], lastProcessedBlock: 0, lastUpdated: 0 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as StoredData;
      return {
        transactions: data.transactions ?? [],
        lastProcessedBlock: data.lastProcessedBlock ?? 0,
        lastUpdated: data.lastUpdated ?? 0,
      };
    }
  } catch {
    // corrupted cache
  }
  return { transactions: [], lastProcessedBlock: 0, lastUpdated: 0 };
}

function saveCache(data: StoredData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded, ignore
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcAvg(txs: OracleTransaction[]): number {
  return txs.length > 0 ? txs.reduce((s, t) => s + t.gasCostUSD, 0) / txs.length : 0;
}

function calcDeviation(avg: number, allTime: number): number {
  return allTime > 0 ? ((avg - allTime) / allTime) * 100 : 0;
}

function calculateStatistics(transactions: OracleTransaction[]): GasStatistics {
  const now = Date.now();
  const dayMs = 86_400_000;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;

  const dayTxs = transactions.filter((t) => now - t.timestamp < dayMs);
  const weekTxs = transactions.filter((t) => now - t.timestamp < weekMs);
  const monthTxs = transactions.filter((t) => now - t.timestamp < monthMs);

  const allTimeAverage = calcAvg(transactions);
  const dayAverage = calcAvg(dayTxs);
  const weekAverage = calcAvg(weekTxs);
  const monthAverage = calcAvg(monthTxs);

  // Aggregate by day for chart
  const dailyMap = new Map<string, { totalCost: number; count: number }>();
  for (const tx of transactions) {
    const date = new Date(tx.timestamp).toISOString().split("T")[0];
    const entry = dailyMap.get(date) ?? { totalCost: 0, count: 0 };
    entry.totalCost += tx.gasCostUSD;
    entry.count += 1;
    dailyMap.set(date, entry);
  }

  const dailyData: DailyGasData[] = Array.from(dailyMap.entries())
    .map(([date, d]) => ({
      date,
      avgGasCost: d.totalCost / d.count,
      totalGasCost: d.totalCost,
      transactionCount: d.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    lastQuery: transactions.length > 0 ? transactions[0] : null,
    dayAverage,
    weekAverage,
    monthAverage,
    allTimeAverage,
    dayDeviation: calcDeviation(dayAverage, allTimeAverage),
    weekDeviation: calcDeviation(weekAverage, allTimeAverage),
    monthDeviation: calcDeviation(monthAverage, allTimeAverage),
    totalTransactions: transactions.length,
    dailyData,
  };
}

// ── Main fetch function ──────────────────────────────────────────────────────

async function fetchKeeperGasMetrics(): Promise<OracleGasMetrics> {
  // 1. ETH price from Chainlink
  const ethPriceRaw = await client.readContract({
    address: CHAINLINK_ETH_USD as Address,
    abi: chainlinkAbi,
    functionName: "latestAnswer",
  });
  const ethPrice = Number(ethPriceRaw) / 1e8;

  // 2. Keeper ETH balance
  const balanceWei = await client.getBalance({
    address: ORACLE_KEEPER_ADDRESS as Address,
  });
  const ethBalance = Number(formatEther(balanceWei));

  // 3. Fetch oracle price-update logs (incremental)
  const cache = loadCache();
  const latestBlock = await client.getBlockNumber();
  const latestBlockNum = Number(latestBlock);

  // Start from last processed or go back ~7 days (~50k blocks)
  const startBlock = cache.lastProcessedBlock > 0
    ? cache.lastProcessedBlock + 1
    : latestBlockNum - 50_000;

  // Fetch from both v0.2 and v0.1 oracles, in 1000-block chunks (RPC limit)
  const allNewTxHashes = new Set<string>();
  const chunkSize = 1000;

  for (const oracleAddr of [CLEAR_ORACLE_ADDRESS, CLEAR_ORACLE_V01_ADDRESS]) {
    for (let from = startBlock; from <= latestBlockNum; from += chunkSize) {
      const to = Math.min(from + chunkSize - 1, latestBlockNum);
      try {
        const logs = await client.getLogs({
          address: oracleAddr as Address,
          event: priceUpdateEvent,
          fromBlock: BigInt(from),
          toBlock: BigInt(to),
        });
        for (const log of logs) {
          allNewTxHashes.add(log.transactionHash);
        }
      } catch {
        // RPC error on this chunk, skip
      }
    }
  }

  // Deduplicate against cache
  const existingHashes = new Set(cache.transactions.map((t) => t.hash));
  const newHashes = [...allNewTxHashes].filter((h) => !existingHashes.has(h));

  // Fetch receipt+block for each new tx
  const newTransactions: OracleTransaction[] = [];

  for (const txHash of newHashes) {
    try {
      const [receipt, tx] = await Promise.all([
        client.getTransactionReceipt({ hash: txHash as Hash }),
        client.getTransaction({ hash: txHash as Hash }),
      ]);

      if (
        receipt &&
        tx &&
        receipt.from.toLowerCase() === ORACLE_KEEPER_ADDRESS.toLowerCase()
      ) {
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });
        const gasUsed = Number(receipt.gasUsed);
        const gasPrice = Number(receipt.effectiveGasPrice ?? tx.gasPrice ?? BigInt(0)) / 1e9;
        const gasCostETH = (gasUsed * gasPrice) / 1e9;

        newTransactions.push({
          hash: txHash,
          blockNumber: Number(receipt.blockNumber),
          timestamp: Number(block.timestamp) * 1000,
          gasUsed,
          gasPrice,
          gasCostETH,
          gasCostUSD: gasCostETH * ethPrice,
        });
      }
    } catch {
      // skip failed tx lookups
    }
  }

  // Merge and sort (newest first)
  const allTransactions = [...cache.transactions, ...newTransactions].sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  // Persist to localStorage
  saveCache({
    transactions: allTransactions,
    lastProcessedBlock: latestBlockNum,
    lastUpdated: Date.now(),
  });

  // 4. Calculate statistics & runway
  const statistics = calculateStatistics(allTransactions);
  const ethBalanceUSD = ethBalance * ethPrice;

  const avgCostPerTxUSD = statistics.allTimeAverage > 0 ? statistics.allTimeAverage : 0.03;
  const avgCostPerTxETH = avgCostPerTxUSD / ethPrice;
  const txPerHour = 1;
  const hoursRemaining =
    avgCostPerTxETH > 0
      ? ethBalance / (avgCostPerTxETH * txPerHour)
      : ethBalance / 0.0001;

  return {
    ethBalance,
    ethBalanceUSD,
    expectedRunwayDays: hoursRemaining / 24,
    expectedRunwayHours: hoursRemaining,
    statistics,
    ethPrice,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useKeeperGas() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["keeper-gas"],
    queryFn: fetchKeeperGasMetrics,
    staleTime: 5 * 60_000,       // 5 min
    refetchInterval: 5 * 60_000, // auto-refresh every 5 min
  });

  function clearCache() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    queryClient.invalidateQueries({ queryKey: ["keeper-gas"] });
  }

  return { ...query, clearCache };
}
