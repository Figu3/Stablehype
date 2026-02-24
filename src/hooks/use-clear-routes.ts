"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import {
  CLEAR_TOKENS,
  CLEAR_ORACLE_ADDRESS,
  CLEAR_SWAP_ADDRESS,
  clearOracleAbi,
  clearSwapAbi,
  ETH_RPC_URL,
  ORACLE_DECIMALS,
} from "@/lib/clear-contracts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClearTokenPrice {
  symbol: string;
  address: Address;
  price: bigint;           // 8-decimal normalised USD price
  redemptionPrice: bigint; // 8-decimal redemption price
  oracleActive: boolean;   // true if oracle enabled
  oracleStale: boolean;    // true if price exceeds priceTTL
  lastUpdate: number;      // unix seconds of last price push
  priceTTL: number;        // seconds before price is considered stale
}

export interface ClearRoute {
  from: string;   // symbol
  to: string;     // symbol
  open: boolean;
  reason?: string; // human-readable reason when closed
}

export interface ClearRoutesData {
  tokens: ClearTokenPrice[];
  routes: ClearRoute[];
  depegThresholdBps: bigint;
  maxDepegThresholdBps: bigint;
  fetchedAt: number;
}

// ── Viem client (singleton) ──────────────────────────────────────────────────

const client = createPublicClient({
  chain: mainnet,
  transport: http(ETH_RPC_URL),
});

// ── Fetch logic ──────────────────────────────────────────────────────────────

async function fetchClearRoutes(): Promise<ClearRoutesData> {
  // 1. Use oracleConfiguration() — it never reverts on stale data
  const oracleCalls = CLEAR_TOKENS.map((t) => ({
    address: CLEAR_ORACLE_ADDRESS as Address,
    abi: clearOracleAbi,
    functionName: "oracleConfiguration" as const,
    args: [t.address as Address],
  }));

  const thresholdCall = {
    address: CLEAR_SWAP_ADDRESS as Address,
    abi: clearSwapAbi,
    functionName: "getDepegTresholdBps" as const,
  };

  const results = await client.multicall({
    contracts: [...oracleCalls, thresholdCall],
    allowFailure: true,
  });

  const now = Math.floor(Date.now() / 1000);

  // 2. Parse oracle config results
  const tokens: ClearTokenPrice[] = CLEAR_TOKENS.map((t, i) => {
    const r = results[i];
    if (r.status === "failure") {
      return {
        symbol: t.symbol,
        address: t.address as Address,
        price: BigInt(0),
        redemptionPrice: BigInt(0),
        oracleActive: false,
        oracleStale: true,
        lastUpdate: 0,
        priceTTL: 0,
      };
    }

    // oracleConfiguration returns:
    // (bool enabled, uint8 assetDecimals, uint8 oracleDecimals, uint256 redemptionPrice,
    //  uint256 priceTTL, uint256 lastUpdateTimestamp, uint256 price, uint8 adapterType, address adapter)
    const [
      enabled,
      _assetDecimals,
      oracleDecimals,
      redemptionPrice,
      priceTTL,
      lastUpdateTimestamp,
      rawPrice,
      _adapterType,
      _adapter,
    ] = r.result as [boolean, number, number, bigint, bigint, bigint, bigint, number, Address];

    // Normalize price to 8 decimals (same logic as the contract)
    let price = rawPrice;
    if (oracleDecimals !== 8) {
      if (oracleDecimals > 8) {
        price = price / (BigInt(10) ** BigInt(oracleDecimals - 8));
      } else {
        price = price * (BigInt(10) ** BigInt(8 - oracleDecimals));
      }
    }

    const ttl = Number(priceTTL);
    const lastTs = Number(lastUpdateTimestamp);
    const isStale = lastTs < now - ttl;

    return {
      symbol: t.symbol,
      address: t.address as Address,
      price,
      redemptionPrice,
      oracleActive: enabled,
      oracleStale: isStale,
      lastUpdate: lastTs,
      priceTTL: ttl,
    };
  });

  // 3. Parse threshold result
  const thresholdResult = results[CLEAR_TOKENS.length];
  let depegThresholdBps = BigInt(9900);  // fallback
  let maxDepegThresholdBps = BigInt(9000);
  if (thresholdResult.status === "success") {
    const [depeg, maxDepeg] = thresholdResult.result as [bigint, bigint];
    depegThresholdBps = depeg;
    maxDepegThresholdBps = maxDepeg;
  }

  // 4. Compute routes — replicate ClearSwap._calculateSwapOutput checks
  const priceDenominator = BigInt(10) ** BigInt(ORACLE_DECIMALS);
  const routes: ClearRoute[] = [];

  for (const from of tokens) {
    for (const to of tokens) {
      if (from.symbol === to.symbol) continue;

      // Oracle must be enabled for both
      if (!from.oracleActive) {
        routes.push({ from: from.symbol, to: to.symbol, open: false, reason: `${from.symbol} oracle disabled` });
        continue;
      }
      if (!to.oracleActive) {
        routes.push({ from: from.symbol, to: to.symbol, open: false, reason: `${to.symbol} oracle disabled` });
        continue;
      }

      // If either oracle is stale, the on-chain swap would revert — route is effectively closed
      if (from.oracleStale) {
        routes.push({ from: from.symbol, to: to.symbol, open: false, reason: `${from.symbol} oracle stale` });
        continue;
      }
      if (to.oracleStale) {
        routes.push({ from: from.symbol, to: to.symbol, open: false, reason: `${to.symbol} oracle stale` });
        continue;
      }

      // Check 1: fromPrice must be depegged (< toPrice * depegThreshold / 10000)
      // Contract: if(_fromPrice > _toPrice * depegThresholdBps / 10000) revert AssetIsNotDepeg();
      const notDepegged = from.price > (to.price * depegThresholdBps) / BigInt(10000);
      if (notDepegged) {
        routes.push({ from: from.symbol, to: to.symbol, open: false, reason: `${from.symbol} is not depegged` });
        continue;
      }

      // Check 2: fromPrice must not be TOO depegged
      // Contract: if(_fromPrice < _toPrice * maximalDepegThresholdBps / 10000) revert AssetDepegIsTooHigh();
      const tooDepegged = from.price < (to.price * maxDepegThresholdBps) / BigInt(10000);
      if (tooDepegged) {
        routes.push({ from: from.symbol, to: to.symbol, open: false, reason: `${from.symbol} depeg too severe` });
        continue;
      }

      // Check 3: toAsset must NOT be depegged
      // Contract: if(_toPrice * 10000 / 10**_toPriceDecimals < depegThresholdBps) revert OutAssetIsDepeg();
      const toDepegged = (to.price * BigInt(10000)) / priceDenominator < depegThresholdBps;
      if (toDepegged) {
        routes.push({ from: from.symbol, to: to.symbol, open: false, reason: `${to.symbol} is also depegged` });
        continue;
      }

      routes.push({ from: from.symbol, to: to.symbol, open: true });
    }
  }

  return { tokens, routes, depegThresholdBps, maxDepegThresholdBps, fetchedAt: Date.now() };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useClearRoutes(enabled = true) {
  return useQuery({
    queryKey: ["clear-routes"],
    queryFn: fetchClearRoutes,
    staleTime: 60 * 1000,       // 1 min — on-chain data
    refetchInterval: 60 * 1000, // auto-refresh every minute
    enabled,
  });
}
