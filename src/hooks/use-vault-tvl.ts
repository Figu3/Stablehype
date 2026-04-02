"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, fallback, type Address } from "viem";
import { mainnet } from "viem/chains";
import { CLEAR_VAULT_ADDRESS, ETH_RPC_URL, ETH_RPC_FALLBACKS } from "@/lib/clear-contracts";

const vaultClient = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http(ETH_RPC_URL),
    ...ETH_RPC_FALLBACKS.map((url) => http(url)),
  ]),
});

const erc4626Abi = [
  {
    name: "totalAssets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

async function fetchVaultTVL(): Promise<{ tvlUSD: number }> {
  try {
    const [totalAssets, decimals] = await Promise.all([
      vaultClient.readContract({
        address: CLEAR_VAULT_ADDRESS as Address,
        abi: erc4626Abi,
        functionName: "totalAssets",
      }),
      vaultClient.readContract({
        address: CLEAR_VAULT_ADDRESS as Address,
        abi: erc4626Abi,
        functionName: "decimals",
      }),
    ]);
    // totalAssets is denominated in vault's base unit (stablecoins ~ $1)
    const tvlUSD = Number(totalAssets) / 10 ** decimals;
    return { tvlUSD };
  } catch {
    // Vault contract may revert (e.g. arithmetic overflow) — return null
    // to let the UI fall back to snapshot-based TVL from the PnL API
    return { tvlUSD: 0 };
  }
}

export function useVaultTVL() {
  return useQuery({
    queryKey: ["clear-vault-tvl"],
    queryFn: fetchVaultTVL,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
