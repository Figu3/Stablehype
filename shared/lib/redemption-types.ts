// Plain TypeScript types ported from Pharos shared/types/redemption.ts (Zod removed).
// Stablehype does not use Zod; runtime validation is omitted because all
// configs are authored in-repo and trusted at build time.

export type RedemptionRouteFamily =
  | "stablecoin-redeem"
  | "basket-redeem"
  | "collateral-redeem"
  | "psm-swap"
  | "queue-redeem"
  | "offchain-issuer";

export type RedemptionAccessModel =
  | "permissionless-onchain"
  | "whitelisted-onchain"
  | "issuer-api"
  | "manual";

export type RedemptionSettlementModel =
  | "atomic"
  | "immediate"
  | "same-day"
  | "days"
  | "queued";

export type RedemptionExecutionModel =
  | "deterministic-onchain"
  | "deterministic-basket"
  | "rules-based-nav"
  | "opaque";

export type RedemptionOutputAssetType =
  | "stable-single"
  | "stable-basket"
  | "bluechip-collateral"
  | "mixed-collateral"
  | "nav";

export type RedemptionSourceMode = "dynamic" | "estimated" | "static";

export type RedemptionResolutionState =
  | "resolved"
  | "missing-cache"
  | "missing-capacity"
  | "failed";

export type RedemptionCapacityConfidence =
  | "live-direct"
  | "live-proxy"
  | "dynamic"
  | "documented-bound"
  | "heuristic";

export type RedemptionCapacityBasis =
  | "issuer-term-redemption"
  | "full-system-eventual"
  | "daily-limit"
  | "hot-buffer"
  | "psm-balance-share"
  | "strategy-buffer"
  | "live-direct-telemetry"
  | "live-proxy-buffer";

export type RedemptionCapacitySemantics = "immediate-bounded" | "eventual-only";

export type RedemptionFeeConfidence = "fixed" | "formula" | "undisclosed-reviewed";

export type RedemptionFeeModelKind =
  | "fixed-bps"
  | "formula"
  | "documented-variable"
  | "undisclosed-reviewed";

export type RedemptionModelConfidence = "high" | "medium" | "low";

export type RedemptionDocSourceSupport =
  | "route"
  | "capacity"
  | "fees"
  | "access"
  | "settlement";

export type RedemptionDocsProvenance =
  | "config-reviewed"
  | "live-reserve-display"
  | "proof-of-reserves"
  | "preferred-link";

export interface RedemptionDocSource {
  label: string;
  url: string;
  supports?: RedemptionDocSourceSupport[];
}

export interface RedemptionDocs {
  label?: string;
  url?: string;
  reviewedAt?: string;
  provenance?: RedemptionDocsProvenance;
  sources?: RedemptionDocSource[];
}

export interface RedemptionBackstopEntry {
  stablecoinId: string;
  score: number | null;
  effectiveExitScore: number | null;
  dexLiquidityScore: number | null;
  accessScore: number | null;
  settlementScore: number | null;
  executionCertaintyScore: number | null;
  capacityScore: number | null;
  outputAssetQualityScore: number | null;
  costScore: number | null;
  routeFamily: RedemptionRouteFamily;
  accessModel: RedemptionAccessModel;
  settlementModel: RedemptionSettlementModel;
  executionModel: RedemptionExecutionModel;
  outputAssetType: RedemptionOutputAssetType;
  provider: string;
  sourceMode: RedemptionSourceMode;
  resolutionState: RedemptionResolutionState;
  capacityConfidence: RedemptionCapacityConfidence;
  capacityBasis?: RedemptionCapacityBasis;
  capacitySemantics: RedemptionCapacitySemantics;
  feeConfidence: RedemptionFeeConfidence;
  feeModelKind: RedemptionFeeModelKind;
  modelConfidence: RedemptionModelConfidence;
  immediateCapacityUsd: number | null;
  immediateCapacityRatio: number | null;
  feeBps: number | null;
  feeDescription?: string;
  queueEnabled: boolean;
  methodologyVersion: string;
  updatedAt: number;
  docs?: RedemptionDocs | null;
  notes?: string[];
  capsApplied?: string[];
}

export type RedemptionBackstopMap = Record<string, RedemptionBackstopEntry>;

export interface RedemptionBackstopMethodology {
  version: string;
  effectiveAt: string;
  componentWeights: {
    access: number;
    settlement: number;
    executionCertainty: number;
    capacity: number;
    outputAssetQuality: number;
    cost: number;
  };
  effectiveExitModel: {
    model: string;
    diversificationFactor: number;
  };
  routeFamilyCaps: {
    queueRedeem: number;
    offchainIssuer: number;
  };
}

export interface RedemptionBackstopsResponse {
  coins: RedemptionBackstopMap;
  methodology: RedemptionBackstopMethodology;
  updatedAt: number;
}
