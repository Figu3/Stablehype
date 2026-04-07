// GET /api/redemption-backstops
//
// Static-only redemption backstop snapshot. Reads the cached `stablecoins`
// payload to look up circulating supply per stablecoin, applies each config's
// `capacityModel` to derive an immediate-capacity USD figure, then runs the
// shared scoring module. Configs without a matching stablecoin are skipped.
//
// Dynamic capacity (live reserves) is deferred to a follow-up phase: configs
// using `reserve-sync-metadata` are returned with null capacity for now.
import { getCache } from "../lib/db";
import {
  REDEMPTION_BACKSTOP_CONFIGS,
  type RedemptionBackstopConfig,
  type RedemptionCapacityModel,
} from "@shared/lib/redemption-backstops";
import {
  REDEMPTION_BACKSTOP_COMPONENT_WEIGHTS,
  REDEMPTION_ACCESS_SCORES,
  REDEMPTION_EXECUTION_SCORES,
  REDEMPTION_OUTPUT_ASSET_SCORES,
  REDEMPTION_ROUTE_FAMILY_CAPS,
  REDEMPTION_SETTLEMENT_SCORES,
  computeCapacityScore,
  computeRedemptionBackstopScore,
  EFFECTIVE_EXIT_DIVERSIFICATION_FACTOR,
} from "@shared/lib/redemption-backstop-scoring";
import {
  resolveCapacityConfidence,
  resolveCapacitySemantics,
  resolveFeeConfidence,
  resolveFeeModelKind,
  deriveModelConfidence,
} from "@shared/lib/redemption-backstop-confidence";
import { REDEMPTION_BACKSTOP_VERSION } from "@shared/lib/redemption-backstop-version";
import { derivePegRates } from "@shared/lib/peg-rates";
import type {
  RedemptionBackstopEntry,
  RedemptionBackstopMethodology,
  RedemptionBackstopsResponse,
} from "@shared/lib/redemption-types";
import type { StablecoinData } from "@shared/lib/types";

interface CachedStablecoinsPayload {
  data: StablecoinData[];
}

function getCirculatingUsd(coin: StablecoinData, rates: Record<string, number>): number {
  if (!coin.circulating) return 0;
  let total = 0;
  for (const [peg, value] of Object.entries(coin.circulating)) {
    const rate = peg === "peggedGOLD" ? 1 : (rates[peg] ?? 1);
    total += (value ?? 0) * rate;
  }
  return total;
}

function resolveStaticCapacity(
  model: RedemptionCapacityModel,
  circulatingUsd: number,
): { immediateCapacityUsd: number | null; immediateCapacityRatio: number | null } {
  switch (model.kind) {
    case "supply-full":
      return { immediateCapacityUsd: circulatingUsd, immediateCapacityRatio: 1.0 };
    case "supply-ratio":
      return {
        immediateCapacityUsd: circulatingUsd * model.ratio,
        immediateCapacityRatio: model.ratio,
      };
    case "reserve-sync-metadata":
      // Static-only fallback: use the configured fallback ratio if any.
      if (typeof model.fallbackRatio === "number") {
        return {
          immediateCapacityUsd: circulatingUsd * model.fallbackRatio,
          immediateCapacityRatio: model.fallbackRatio,
        };
      }
      return { immediateCapacityUsd: null, immediateCapacityRatio: null };
  }
}

function buildEntry(
  stablecoinId: string,
  config: RedemptionBackstopConfig,
  circulatingUsd: number,
  updatedAt: number,
): RedemptionBackstopEntry {
  const capacity = resolveStaticCapacity(config.capacityModel, circulatingUsd);

  const accessScore = REDEMPTION_ACCESS_SCORES[config.accessModel];
  const settlementScore = REDEMPTION_SETTLEMENT_SCORES[config.settlementModel];
  const executionCertaintyScore = REDEMPTION_EXECUTION_SCORES[config.executionModel];
  const outputAssetQualityScore = REDEMPTION_OUTPUT_ASSET_SCORES[config.outputAssetType];
  const costScore = config.costModel.kind === "fee-bps"
    ? Math.max(0, 100 - config.costModel.feeBps)
    : 50;

  const { score: capacityScore } = computeCapacityScore({
    immediateCapacityUsd: capacity.immediateCapacityUsd,
    immediateCapacityRatio: capacity.immediateCapacityRatio,
  });

  const { score, capsApplied } = computeRedemptionBackstopScore({
    routeFamily: config.routeFamily,
    accessScore,
    settlementScore,
    executionCertaintyScore,
    capacityScore,
    outputAssetQualityScore,
    costScore,
    totalScoreCap: config.totalScoreCap,
  });

  const capacityConfidence = resolveCapacityConfidence(config.capacityModel);
  const capacitySemantics = resolveCapacitySemantics(config.capacityModel);
  const feeConfidence = resolveFeeConfidence(config.costModel);
  const feeModelKind = resolveFeeModelKind(config.costModel);

  const modelConfidence = deriveModelConfidence({
    resolutionState: capacity.immediateCapacityUsd == null ? "missing-capacity" : "resolved",
    capacityConfidence,
    feeConfidence,
  });

  return {
    stablecoinId,
    score,
    effectiveExitScore: score, // dexLiquidityScore is null in static-only mode
    dexLiquidityScore: null,
    accessScore,
    settlementScore,
    executionCertaintyScore,
    capacityScore,
    outputAssetQualityScore,
    costScore,
    routeFamily: config.routeFamily,
    accessModel: config.accessModel,
    settlementModel: config.settlementModel,
    executionModel: config.executionModel,
    outputAssetType: config.outputAssetType,
    provider: "static-config",
    sourceMode: "static",
    resolutionState: capacity.immediateCapacityUsd == null ? "missing-capacity" : "resolved",
    capacityConfidence,
    capacityBasis: config.capacityModel.basis,
    capacitySemantics,
    feeConfidence,
    feeModelKind,
    modelConfidence,
    immediateCapacityUsd: capacity.immediateCapacityUsd,
    immediateCapacityRatio: capacity.immediateCapacityRatio,
    feeBps: config.costModel.kind === "fee-bps" ? config.costModel.feeBps : null,
    feeDescription: config.costModel.feeDescription,
    queueEnabled: config.routeFamily === "queue-redeem",
    methodologyVersion: REDEMPTION_BACKSTOP_VERSION.currentVersion,
    updatedAt,
    docs: config.docs ? { sources: config.docs, reviewedAt: config.reviewedAt } : null,
    notes: config.notes,
    capsApplied,
  };
}

function buildMethodology(): RedemptionBackstopMethodology {
  return {
    version: REDEMPTION_BACKSTOP_VERSION.currentVersion,
    effectiveAt: REDEMPTION_BACKSTOP_VERSION.changelog[0]?.date ?? "",
    componentWeights: { ...REDEMPTION_BACKSTOP_COMPONENT_WEIGHTS },
    effectiveExitModel: {
      model: "max(liquidity, redemption) + diversification-bonus",
      diversificationFactor: EFFECTIVE_EXIT_DIVERSIFICATION_FACTOR,
    },
    routeFamilyCaps: { ...REDEMPTION_ROUTE_FAMILY_CAPS },
  };
}

export async function handleRedemptionBackstops(db: D1Database): Promise<Response> {
  try {
    const cached = await getCache(db, "stablecoins");
    if (!cached) {
      return new Response(JSON.stringify({ error: "Stablecoin cache not yet available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(cached.value) as CachedStablecoinsPayload;
    const coinsArray = Array.isArray(parsed?.data) ? parsed.data : [];
    const rates = derivePegRates(coinsArray);
    const supplyById = new Map<string, number>();
    for (const coin of coinsArray) {
      supplyById.set(coin.id, getCirculatingUsd(coin, rates));
    }

    const entries: Record<string, RedemptionBackstopEntry> = {};
    for (const [stablecoinId, config] of Object.entries(REDEMPTION_BACKSTOP_CONFIGS)) {
      const supply = supplyById.get(stablecoinId) ?? 0;
      entries[stablecoinId] = buildEntry(stablecoinId, config, supply, cached.updatedAt);
    }

    const response: RedemptionBackstopsResponse = {
      coins: entries,
      methodology: buildMethodology(),
      updatedAt: cached.updatedAt,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, max-age=60",
        "X-Data-Updated-At": String(cached.updatedAt),
        "X-Methodology-Version": REDEMPTION_BACKSTOP_VERSION.currentVersion,
      },
    });
  } catch (err) {
    console.error("[redemption-backstops] failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
