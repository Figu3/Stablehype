"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, fallback, type Address, type Hex } from "viem";
import { mainnet } from "viem/chains";
import {
  CLEAR_VAULT_ADDRESS,
  CLEAR_TOKENS,
  ETH_RPC_URL,
  ETH_RPC_FALLBACKS,
} from "@/lib/clear-contracts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VaultTokenComposition {
  symbol: string;
  address: string;
  decimals: number;
  balance: number;       // human-readable token amount
  exposureBps: number;   // current allocation in bps (e.g. 2000 = 20%)
  desiredBps: number;    // target allocation in bps
  maxBps: number;        // max allowed allocation in bps
}

export interface VaultComposition {
  totalAssets: number;   // human-readable total value (18 decimals on-chain)
  tokens: VaultTokenComposition[];
  iouFeeBps: number;
}

// ── Viem client ──────────────────────────────────────────────────────────────

const client = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http(ETH_RPC_URL),
    ...ETH_RPC_FALLBACKS.map((url) => http(url)),
  ]),
});

// ── ABI for vault.details() ──────────────────────────────────────────────────

const vaultDetailsAbi = [
  {
    name: "details",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "maximumRebalanceBpsSpread", type: "uint256" },
      { name: "maximumRebalanceBpsSpread2", type: "uint256" },
      { name: "desiredExposureMaximalBpsSpread", type: "uint256" },
      { name: "iouFeeBps", type: "uint256" },
      { name: "totalAssets", type: "uint256" },
      {
        name: "tokens",
        type: "tuple[]",
        components: [
          { name: "addr", type: "address" },
          { name: "iou", type: "address" },
          { name: "iouCurvePool", type: "address" },
          { name: "adapter", type: "address" },
          { name: "maxExposureBps", type: "uint256" },
          { name: "desiredExposureBps", type: "uint256" },
          { name: "emitedIou", type: "uint256" },
          { name: "balance", type: "uint256" },
          { name: "exposure", type: "uint256" },
          { name: "decimals", type: "uint8" },
        ],
      },
    ],
  },
] as const;

// ── Raw hex decoding (fallback if viem ABI decode fails) ─────────────────────

function decodeUint256(hex: string): bigint {
  return BigInt("0x" + hex);
}

function decodeDetailsFromHex(hex: string): VaultComposition {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  const word = (i: number) => data.slice(i * 64, (i + 1) * 64);

  const iouFeeBps = Number(decodeUint256(word(3)));
  const totalAssetsRaw = decodeUint256(word(4));
  const totalAssets = Number(totalAssetsRaw) / 1e18;

  // Array at word 6: length, then 10-word tuples inline
  const tokenCount = Number(decodeUint256(word(6)));

  // Build address → CLEAR_TOKENS lookup
  const tokenMap = new Map(
    CLEAR_TOKENS.map((t) => [t.address.toLowerCase(), t])
  );

  const tokens: VaultTokenComposition[] = [];
  for (let i = 0; i < tokenCount; i++) {
    const base = 7 + i * 10;
    const addr = "0x" + word(base).slice(24).toLowerCase();
    const meta = tokenMap.get(addr);
    const decimals = Number(decodeUint256(word(base + 9)));
    const balanceRaw = decodeUint256(word(base + 7));
    const balance = Number(balanceRaw) / 10 ** decimals;

    tokens.push({
      symbol: meta?.symbol ?? "???",
      address: addr,
      decimals,
      balance,
      exposureBps: Number(decodeUint256(word(base + 8))),
      desiredBps: Number(decodeUint256(word(base + 5))),
      maxBps: Number(decodeUint256(word(base + 4))),
    });
  }

  return { totalAssets, tokens, iouFeeBps };
}

// ── Fetch logic ──────────────────────────────────────────────────────────────

async function fetchVaultComposition(): Promise<VaultComposition> {
  // Try viem readContract first; fall back to raw eth_call + manual decode
  try {
    const result = await client.readContract({
      address: CLEAR_VAULT_ADDRESS as Address,
      abi: vaultDetailsAbi,
      functionName: "details",
    });

    // viem returns a tuple: [maxRebalance, maxRebalance2, desiredSpread, iouFee, totalAssets, tokens[]]
    const [, , , iouFeeBps, totalAssetsRaw, rawTokens] = result as [
      bigint, bigint, bigint, bigint, bigint,
      readonly {
        addr: Address;
        iou: Address;
        iouCurvePool: Address;
        adapter: Address;
        maxExposureBps: bigint;
        desiredExposureBps: bigint;
        emitedIou: bigint;
        balance: bigint;
        exposure: bigint;
        decimals: number;
      }[]
    ];

    const tokenMap = new Map(
      CLEAR_TOKENS.map((t) => [t.address.toLowerCase(), t])
    );

    const tokens: VaultTokenComposition[] = rawTokens.map((t) => {
      const meta = tokenMap.get(t.addr.toLowerCase());
      const decimals = t.decimals;
      return {
        symbol: meta?.symbol ?? "???",
        address: t.addr.toLowerCase(),
        decimals,
        balance: Number(t.balance) / 10 ** decimals,
        exposureBps: Number(t.exposure),
        desiredBps: Number(t.desiredExposureBps),
        maxBps: Number(t.maxExposureBps),
      };
    });

    return {
      totalAssets: Number(totalAssetsRaw) / 1e18,
      tokens,
      iouFeeBps: Number(iouFeeBps),
    };
  } catch {
    // Fallback: raw eth_call + manual hex decode
    const hex = await client.call({
      to: CLEAR_VAULT_ADDRESS as Address,
      data: "0x565974d3" as Hex, // details() selector
    });
    if (!hex.data) throw new Error("vault.details() returned empty data");
    return decodeDetailsFromHex(hex.data);
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useVaultComposition() {
  return useQuery({
    queryKey: ["clear-vault-composition"],
    queryFn: fetchVaultComposition,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
