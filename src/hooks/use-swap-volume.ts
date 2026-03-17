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

async function fetchSwapVolume7d(): Promise<{ volumeUSD: number; swapCount: number }> {
  const latestBlock = Number(await client.getBlockNumber());
  // ~7 days of blocks at 12s/block
  const blocksIn7d = Math.ceil((7 * 24 * 3600) / 12);
  const fromBlock = latestBlock - blocksIn7d;

  const chunkSize = 2_000;
  let totalVolume = 0;
  let swapCount = 0;

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
      }
    } catch {
      // RPC error on this chunk, skip
    }
  }

  return { volumeUSD: totalVolume, swapCount };
}

export function useSwapVolume() {
  return useQuery({
    queryKey: ["clear-swap-volume-7d"],
    queryFn: fetchSwapVolume7d,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
