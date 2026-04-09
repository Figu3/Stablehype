// GET /api/csi
//
// Clear Stability Index — composite score for the 6 Clear oracle stables.
// Reads peg scores (depeg events from D1), bluechip ratings (D1 cache),
// DEX liquidity (D1), and computes dependency risk + redemption backstop
// inline from pure config + supply cache.

import { getCache } from "../lib/db";
import { computeCsi, CSI_WEIGHTS } from "@shared/lib/csi-scoring";
import { CSI_VERSION } from "@shared/lib/csi-version";
import { CLEAR_ORACLE_RISK_CONFIGS, getConfiguredClearOracleRiskIds } from "@shared/lib/clear-oracle-risk-config";
import { scoreAllClearOracleConfigs } from "@shared/lib/clear-oracle-risk-scoring";
import { computePegScore } from "@shared/lib/peg-score";
import { GRADE_ORDER } from "@shared/lib/bluechip";
import { derivePegRates } from "@shared/lib/peg-rates";
import { REDEMPTION_BACKSTOP_CONFIGS } from "@shared/lib/redemption-backstops";
import {
  REDEMPTION_ACCESS_SCORES,
  REDEMPTION_EXECUTION_SCORES,
  REDEMPTION_OUTPUT_ASSET_SCORES,
  REDEMPTION_SETTLEMENT_SCORES,
  computeCapacityScore,
  computeRedemptionBackstopScore,
} from "@shared/lib/redemption-backstop-scoring";
import type { CsiComponentScores, CsiResponse } from "@shared/lib/csi-types";
import type { DepegEvent, StablecoinData } from "@shared/lib/types";

const CLEAR_IDS = getConfiguredClearOracleRiskIds();
const CLEAR_ID_SET = new Set(CLEAR_IDS);

// Convert bluechip letter grade to 0-100 numeric scale.
function bluechipGradeToScore(grade: string): number | null {
  const order = GRADE_ORDER[grade];
  if (order == null) return null;
  // GRADE_ORDER: A+=12 ... F=1. Map to 0-100.
  return Math.round((order / 12) * 100);
}

interface DepegRow {
  stablecoin_id: string;
  direction: string;
  peak_deviation_bps: number;
  started_at: number;
  ended_at: number | null;
  start_price: number;
  peak_price: number | null;
  recovery_price: number | null;
  peg_reference: number;
  source: string;
  symbol: string;
  peg_type: string;
  id: number;
}

function rowToEvent(row: DepegRow): DepegEvent {
  return {
    id: row.id,
    stablecoinId: row.stablecoin_id,
    symbol: row.symbol,
    pegType: row.peg_type,
    direction: row.direction as "above" | "below",
    peakDeviationBps: row.peak_deviation_bps,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    startPrice: row.start_price,
    peakPrice: row.peak_price,
    recoveryPrice: row.recovery_price,
    pegReference: row.peg_reference,
    source: row.source as "live" | "backfill",
    startBlock: null,
    endBlock: null,
  };
}

export async function handleCsi(db: D1Database): Promise<Response> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const fourYearsAgo = now - 4 * 365.25 * 86400;
    const placeholders = CLEAR_IDS.map(() => "?").join(",");

    // ── 1. Dependency risk (pure config) ─────────────────
    const depRiskEntries = scoreAllClearOracleConfigs(CLEAR_ORACLE_RISK_CONFIGS);

    // ── 2. Peg scores — read depeg events for the 6 coins ─
    const pegScores = new Map<string, number>();
    try {
      const depegRows = await db.prepare(
        `SELECT * FROM depeg_events WHERE stablecoin_id IN (${placeholders}) ORDER BY started_at`
      ).bind(...CLEAR_IDS).all<DepegRow>();

      const eventsByCoins = new Map<string, DepegEvent[]>();
      for (const row of depegRows.results) {
        const events = eventsByCoins.get(row.stablecoin_id) ?? [];
        events.push(rowToEvent(row));
        eventsByCoins.set(row.stablecoin_id, events);
      }

      for (const id of CLEAR_IDS) {
        const events = eventsByCoins.get(id) ?? [];
        const trackingStart = events.length > 0
          ? Math.min(Math.min(...events.map(e => e.startedAt)), fourYearsAgo)
          : fourYearsAgo;
        const result = computePegScore(events, trackingStart, now);
        if (result.pegScore != null) pegScores.set(id, result.pegScore);
      }
    } catch { /* depeg_events table may not exist */ }

    // ── 3. Bluechip ratings from D1 cache ────────────────
    const bluechipScores = new Map<string, number>();
    const bluechipCache = await getCache(db, "bluechip-ratings");
    if (bluechipCache) {
      try {
        const parsed: Record<string, { grade: string }> = JSON.parse(bluechipCache.value);
        for (const [id, data] of Object.entries(parsed)) {
          if (CLEAR_ID_SET.has(id) && data.grade) {
            const score = bluechipGradeToScore(data.grade);
            if (score != null) bluechipScores.set(id, score);
          }
        }
      } catch { /* malformed cache */ }
    }

    // ── 4. DEX liquidity from D1 ─────────────────────────
    const dexScores = new Map<string, number>();
    try {
      const dexRows = await db.prepare(
        `SELECT stablecoin_id, liquidity_score FROM dex_liquidity WHERE stablecoin_id IN (${placeholders})`
      ).bind(...CLEAR_IDS).all<{ stablecoin_id: string; liquidity_score: number }>();
      for (const row of dexRows.results) {
        if (row.liquidity_score != null) dexScores.set(row.stablecoin_id, row.liquidity_score);
      }
    } catch { /* table may not exist */ }

    // ── 5. Redemption backstop (config + supply cache) ───
    const backstopScores = new Map<string, number>();
    const stablecoinsCache = await getCache(db, "stablecoins");
    if (stablecoinsCache) {
      try {
        const parsed = JSON.parse(stablecoinsCache.value);
        const coinsArray: StablecoinData[] = Array.isArray(parsed?.data) ? parsed.data : [];
        const rates = derivePegRates(coinsArray);

        for (const [id, config] of Object.entries(REDEMPTION_BACKSTOP_CONFIGS)) {
          if (!CLEAR_ID_SET.has(id)) continue;
          const coin = coinsArray.find(c => c.id === id);
          let circulatingUsd = 0;
          if (coin?.circulating) {
            for (const [peg, value] of Object.entries(coin.circulating)) {
              const rate = peg === "peggedGOLD" ? 1 : (rates[peg] ?? 1);
              circulatingUsd += ((value as number) ?? 0) * rate;
            }
          }

          const accessScore = REDEMPTION_ACCESS_SCORES[config.accessModel];
          const settlementScore = REDEMPTION_SETTLEMENT_SCORES[config.settlementModel];
          const executionScore = REDEMPTION_EXECUTION_SCORES[config.executionModel];
          const outputScore = REDEMPTION_OUTPUT_ASSET_SCORES[config.outputAssetType];
          const costScore = config.costModel.kind === "fee-bps"
            ? Math.max(0, 100 - config.costModel.feeBps)
            : 50;

          let capUsd: number | null = null;
          let capRatio: number | null = null;
          switch (config.capacityModel.kind) {
            case "supply-full":
              capUsd = circulatingUsd; capRatio = 1.0; break;
            case "supply-ratio":
              capUsd = circulatingUsd * config.capacityModel.ratio;
              capRatio = config.capacityModel.ratio; break;
            case "reserve-sync-metadata":
              if (typeof config.capacityModel.fallbackRatio === "number") {
                capUsd = circulatingUsd * config.capacityModel.fallbackRatio;
                capRatio = config.capacityModel.fallbackRatio;
              }
              break;
          }

          const { score: capacityScore } = computeCapacityScore({
            immediateCapacityUsd: capUsd,
            immediateCapacityRatio: capRatio,
          });

          const { score } = computeRedemptionBackstopScore({
            routeFamily: config.routeFamily,
            accessScore,
            settlementScore,
            executionCertaintyScore: executionScore,
            capacityScore,
            outputAssetQualityScore: outputScore,
            costScore,
            totalScoreCap: config.totalScoreCap,
          });

          if (score != null) backstopScores.set(id, score);
        }
      } catch { /* redemption backstop computation failed */ }
    }

    // ── 6. Compose CSI for each Clear oracle stable ──────
    const coins: CsiResponse["coins"] = {};
    for (const id of CLEAR_IDS) {
      const components: CsiComponentScores = {
        pegScore: pegScores.get(id) ?? null,
        dependencyRiskScore: depRiskEntries[id]?.score ?? null,
        dexLiquidityScore: dexScores.get(id) ?? null,
        redemptionBackstopScore: backstopScores.get(id) ?? null,
        bluechipScore: bluechipScores.get(id) ?? null,
      };
      coins[id] = computeCsi(id, components);
    }

    const response: CsiResponse = {
      coins,
      methodology: {
        version: CSI_VERSION.currentVersion,
        effectiveAt: CSI_VERSION.changelog[0]?.date ?? "",
        weights: { ...CSI_WEIGHTS },
      },
      updatedAt: now,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, max-age=60",
        "X-Methodology-Version": CSI_VERSION.currentVersion,
      },
    });
  } catch (err) {
    console.error("[csi] failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
