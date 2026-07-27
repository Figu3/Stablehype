// Stablehype Market Index (SMI) — data gathering + composition.
// Pure scoring lives in @shared/lib/market-index-scoring; this module reads
// the stablecoins cache, depeg events, and the aggregate charts cache from D1.

import { getCache } from "./db";
import { TRACKED_STABLECOINS } from "@shared/lib/stablecoins";
import { derivePegRates, getPegReference } from "@shared/lib/peg-rates";
import {
  computeMarketIndex,
  STRESS_DEVIATION_BPS,
  type MarketIndexInputs,
  type MarketIndexResult,
} from "@shared/lib/market-index-scoring";
import type { StablecoinData } from "@shared/lib/types";

export interface MarketIndexSnapshot {
  result: MarketIndexResult;
  inputs: MarketIndexInputs;
  coinsConsidered: number;
  activeDepegCount: number;
  stressedCount: number;
  totalMcapUsd: number;
  updatedAt: number;
}

interface ChartPoint {
  date: number;
  totalCirculatingUSD: Record<string, number>;
}

function sumPoint(p: ChartPoint): number {
  return Object.values(p.totalCirculatingUSD).reduce((s, v) => s + (v ?? 0), 0);
}

export async function buildMarketIndexSnapshot(db: D1Database): Promise<MarketIndexSnapshot | null> {
  const cached = await getCache(db, "stablecoins");
  if (!cached) return null;

  const { peggedAssets, fxFallbackRates } = JSON.parse(cached.value) as {
    peggedAssets: StablecoinData[];
    fxFallbackRates?: Record<string, number>;
  };
  if (!Array.isArray(peggedAssets) || peggedAssets.length === 0) return null;

  const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
  const priceById = new Map(peggedAssets.map((a) => [a.id, a]));
  const rates = derivePegRates(peggedAssets, metaById, fxFallbackRates);

  // Per-coin current deviation (mirrors peg-summary: redemption-adjusted peg ref,
  // navTokens excluded, supply >= $1M)
  let weightedAbsSum = 0;
  let weightTotal = 0;
  let stressedCount = 0;
  let stressedSupply = 0;
  let coinsConsidered = 0;
  const consideredSupplyById = new Map<string, number>();

  for (const meta of TRACKED_STABLECOINS) {
    if (meta.flags.navToken) continue;
    const asset = priceById.get(meta.id);
    if (!asset || asset.price == null || typeof asset.price !== "number" || isNaN(asset.price)) continue;

    const supply = asset.circulating
      ? Object.values(asset.circulating).reduce((s, v) => s + (v ?? 0), 0)
      : 0;
    if (supply < 1_000_000) continue;

    const redemptionFeeBps = meta.redemption?.feeBps ?? 0;
    const redemptionAdj = redemptionFeeBps > 0 ? 1 - redemptionFeeBps / 10000 : 1;
    const pegRef = getPegReference(asset.pegType, rates, meta.goldOunces) * redemptionAdj;
    if (pegRef <= 0) continue;

    const absBps = Math.abs(((asset.price / pegRef) - 1) * 10000);
    coinsConsidered++;
    consideredSupplyById.set(meta.id, supply);
    weightedAbsSum += absBps * supply;
    weightTotal += supply;
    if (absBps >= STRESS_DEVIATION_BPS) {
      stressedCount++;
      stressedSupply += supply;
    }
  }

  if (coinsConsidered === 0 || weightTotal === 0) return null;

  // Active depeg breadth — supply-weighted so permanently-wobbly dust coins
  // in the long tail can't pin the index low; a majors depeg still tanks it.
  let activeDepegCount = 0;
  let depeggedSupply = 0;
  try {
    const rows = await db
      .prepare("SELECT DISTINCT stablecoin_id FROM depeg_events WHERE ended_at IS NULL")
      .all<{ stablecoin_id: string }>();
    for (const row of rows.results ?? []) {
      const supply = consideredSupplyById.get(row.stablecoin_id);
      if (supply != null) {
        activeDepegCount++;
        depeggedSupply += supply;
      }
    }
  } catch {
    // depeg_events table may not exist locally
  }

  // 7d market-cap trend from the aggregate charts cache
  let mcapTrend7dPct: number | null = null;
  let totalMcapUsd = 0;
  const chartsCache = await getCache(db, "stablecoin-charts");
  if (chartsCache) {
    try {
      const points = JSON.parse(chartsCache.value) as ChartPoint[];
      if (Array.isArray(points) && points.length > 0) {
        const sorted = [...points].sort((a, b) => a.date - b.date);
        const latest = sorted[sorted.length - 1];
        totalMcapUsd = sumPoint(latest);
        const target = latest.date - 7 * 86400;
        // Closest point to 7 days ago (daily granularity within 90d window)
        let weekAgo: ChartPoint | null = null;
        for (const p of sorted) {
          if (weekAgo == null || Math.abs(p.date - target) < Math.abs(weekAgo.date - target)) {
            weekAgo = p;
          }
        }
        if (weekAgo && Math.abs(weekAgo.date - target) <= 2 * 86400) {
          const prev = sumPoint(weekAgo);
          if (prev > 0) mcapTrend7dPct = ((totalMcapUsd - prev) / prev) * 100;
        }
      }
    } catch {
      // malformed charts cache — trend stays null, weight redistributes
    }
  }

  const inputs: MarketIndexInputs = {
    weightedAbsDeviationBps: weightedAbsSum / weightTotal,
    activeDepegShare: Math.min(1, depeggedSupply / weightTotal),
    stressShare: Math.min(1, stressedSupply / weightTotal),
    mcapTrend7dPct,
  };

  return {
    result: computeMarketIndex(inputs),
    inputs,
    coinsConsidered,
    activeDepegCount,
    stressedCount,
    totalMcapUsd,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}
