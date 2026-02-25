"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { CLEAR_VAULT_ADDRESS, ETH_RPC_URL } from "@/lib/clear-contracts";

const vaultClient = createPublicClient({
  chain: mainnet,
  transport: http(ETH_RPC_URL),
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
}

export function useVaultTVL() {
  return useQuery({
    queryKey: ["clear-vault-tvl"],
    queryFn: fetchVaultTVL,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
