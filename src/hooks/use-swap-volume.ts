"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, fallback, type Address } from "viem";
import { mainnet } from "viem/chains";
import {
  CLEAR_VAULT_ADDRESS,
  CLEAR_TOKENS,
  ETH_RPC_URL,
  ETH_RPC_FALLBACKS,
} from "@/lib/clear-contracts";

const client = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http(ETH_RPC_URL),
    ...ETH_RPC_FALLBACKS.map((url) => http(url)),
  ]),
});

// Deployed contract has 8 params (interface shows 6, but on-chain has 2 extra fee fields)
const swapEvent = {
  type: "event",
  name: "LiquiditySwapExecuted",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "receiver", type: "address", indexed: false },
    { name: "amountIn", type: "uint256", indexed: false },
    { name: "tokenAmountOut", type: "uint256", indexed: false },
    { name: "lpFee", type: "uint256", indexed: false },
    { name: "iouAmountOut", type: "uint256", indexed: false },
    { name: "iouAmountOut2", type: "uint256", indexed: false },
  ],
} as const;

// Build decimals lookup from CLEAR_TOKENS
const decimalsMap = new Map<string, number>(
  CLEAR_TOKENS.map((t) => [t.address.toLowerCase(), t.decimals]),
);

export interface DailySwapVolume {
  date: string; // YYYY-MM-DD
  volumeUSD: number;
  swapCount: number;
}

export interface SwapVolumeData {
  volumeUSD: number;
  swapCount: number;
  daily: DailySwapVolume[];
}

async function fetchSwapVolume7d(): Promise<SwapVolumeData> {
  const latestBlock = Number(await client.getBlockNumber());
  // ~7 days of blocks at 12s/block
  const blocksIn7d = Math.ceil((7 * 24 * 3600) / 12);
  const fromBlock = latestBlock - blocksIn7d;

  const chunkSize = 2_000;
  let totalVolume = 0;
  let swapCount = 0;

  // Collect per-swap data with block numbers for timestamp resolution
  const swaps: { blockNumber: number; usdValue: number }[] = [];

  for (let from = fromBlock; from <= latestBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, latestBlock);
    try {
      const logs = await client.getLogs({
        address: CLEAR_VAULT_ADDRESS as Address,
        event: swapEvent,
        fromBlock: BigInt(from),
        toBlock: BigInt(to),
      });

      for (const log of logs) {
        const { from: tokenIn, amountIn } = log.args;
        if (!tokenIn || !amountIn) continue;

        const decimals = decimalsMap.get(tokenIn.toLowerCase()) ?? 18;
        const usdValue = Number(amountIn) / 10 ** decimals;
        totalVolume += usdValue;
        swapCount += 1;
        swaps.push({ blockNumber: Number(log.blockNumber), usdValue });
      }
    } catch {
      // RPC error on this chunk, skip
    }
  }

  // Resolve block timestamps for daily bucketing
  const dailyMap = new Map<string, { volumeUSD: number; swapCount: number }>();

  // Batch unique block numbers
  const uniqueBlocks = [...new Set(swaps.map((s) => s.blockNumber))];
  const blockTimestamps = new Map<number, number>();

  for (const blockNum of uniqueBlocks) {
    try {
      const block = await client.getBlock({ blockNumber: BigInt(blockNum) });
      blockTimestamps.set(blockNum, Number(block.timestamp));
    } catch {
      // Estimate: ~12s/block from latest
      const estimatedTs = Math.floor(Date.now() / 1000) - (latestBlock - blockNum) * 12;
      blockTimestamps.set(blockNum, estimatedTs);
    }
  }

  for (const swap of swaps) {
    const ts = blockTimestamps.get(swap.blockNumber) ?? Math.floor(Date.now() / 1000);
    const date = new Date(ts * 1000).toISOString().split("T")[0];
    const entry = dailyMap.get(date) ?? { volumeUSD: 0, swapCount: 0 };
    entry.volumeUSD += swap.usdValue;
    entry.swapCount += 1;
    dailyMap.set(date, entry);
  }

  // Build full 7-day array (fill missing days with 0)
  const daily: DailySwapVolume[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split("T")[0];
    const entry = dailyMap.get(date);
    daily.push({
      date,
      volumeUSD: entry?.volumeUSD ?? 0,
      swapCount: entry?.swapCount ?? 0,
    });
  }

  return { volumeUSD: totalVolume, swapCount, daily };
}

export function useSwapVolume() {
  return useQuery({
    queryKey: ["clear-swap-volume-7d"],
    queryFn: fetchSwapVolume7d,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
