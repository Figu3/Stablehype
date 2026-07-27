// GET /api/flows
//
// Per-coin net mint/burn flows (24h/7d/30d) derived from the DefiLlama
// circulating snapshots already in the stablecoins cache, plus a
// market-cap-weighted bank-run gauge. No new external data source.

import { getCache } from "../lib/db";
import { TRACKED_STABLECOINS } from "@shared/lib/stablecoins";
import { derivePegRates } from "@shared/lib/peg-rates";
import {
  computeGauge,
  computePressureScore,
  gaugeBand,
  FLOW_MIN_SUPPLY_USD,
} from "@shared/lib/flows-scoring";
import { FLOWS_VERSION } from "@shared/lib/flows-version";
import type { StablecoinData } from "@shared/lib/types";

interface FlowCoin {
  id: string;
  symbol: string;
  name: string;
  pegCurrency: string;
  governance: string;
  navToken: boolean;
  supplyUsd: number;
  flow24hUsd: number | null;
  flow7dUsd: number | null;
  flow30dUsd: number | null;
  pct24h: number | null;
  pct7d: number | null;
  pct30d: number | null;
  baselineDailyUsd: number | null;
  pressureScore: number | null;
}

function toUSD(bucket: Record<string, number | null> | undefined, rates: Record<string, number>): number {
  if (!bucket) return 0;
  return Object.entries(bucket).reduce((s, [peg, v]) => {
    const rate = peg === "peggedGOLD" ? 1 : (rates[peg] ?? 1);
    return s + (v ?? 0) * rate;
  }, 0);
}

export async function handleFlows(db: D1Database): Promise<Response> {
  try {
    const cached = await getCache(db, "stablecoins");
    if (!cached) {
      return new Response(JSON.stringify({ error: "Data not yet available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { peggedAssets, fxFallbackRates } = JSON.parse(cached.value) as {
      peggedAssets: StablecoinData[];
      fxFallbackRates?: Record<string, number>;
    };
    const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
    const priceById = new Map(peggedAssets.map((a) => [a.id, a]));
    const rates = derivePegRates(peggedAssets, metaById, fxFallbackRates);

    const coins: FlowCoin[] = [];
    let mint24hUsd = 0;
    let burn24hUsd = 0;
    let net24hUsd = 0;
    let net7dUsd = 0;
    let net30dUsd = 0;

    for (const meta of TRACKED_STABLECOINS) {
      const asset = priceById.get(meta.id);
      if (!asset) continue;

      const supplyUsd = toUSD(asset.circulating, rates);
      if (supplyUsd < FLOW_MIN_SUPPLY_USD) continue;

      const prevDay = toUSD(asset.circulatingPrevDay, rates);
      const prevWeek = toUSD(asset.circulatingPrevWeek, rates);
      const prevMonth = toUSD(asset.circulatingPrevMonth, rates);

      const flow24hUsd = prevDay > 0 ? supplyUsd - prevDay : null;
      const flow7dUsd = prevWeek > 0 ? supplyUsd - prevWeek : null;
      const flow30dUsd = prevMonth > 0 ? supplyUsd - prevMonth : null;
      const baselineDailyUsd = flow30dUsd != null ? flow30dUsd / 30 : null;

      const pressureScore =
        flow24hUsd != null && baselineDailyUsd != null
          ? computePressureScore(flow24hUsd, baselineDailyUsd, supplyUsd)
          : null;

      if (flow24hUsd != null) {
        net24hUsd += flow24hUsd;
        if (flow24hUsd >= 0) mint24hUsd += flow24hUsd;
        else burn24hUsd += -flow24hUsd;
      }
      if (flow7dUsd != null) net7dUsd += flow7dUsd;
      if (flow30dUsd != null) net30dUsd += flow30dUsd;

      coins.push({
        id: meta.id,
        symbol: meta.symbol,
        name: meta.name,
        pegCurrency: meta.flags.pegCurrency,
        governance: meta.flags.governance,
        navToken: meta.flags.navToken,
        supplyUsd,
        flow24hUsd,
        flow7dUsd,
        flow30dUsd,
        pct24h: flow24hUsd != null && prevDay > 0 ? (flow24hUsd / prevDay) * 100 : null,
        pct7d: flow7dUsd != null && prevWeek > 0 ? (flow7dUsd / prevWeek) * 100 : null,
        pct30d: flow30dUsd != null && prevMonth > 0 ? (flow30dUsd / prevMonth) * 100 : null,
        baselineDailyUsd,
        pressureScore,
      });
    }

    const gauge = computeGauge(coins);
    const sortedBy24h = coins.filter((c) => c.flow24hUsd != null).sort((a, b) => b.flow24hUsd! - a.flow24hUsd!);
    const topMint24h = sortedBy24h.slice(0, 5).filter((c) => c.flow24hUsd! > 0)
      .map((c) => ({ id: c.id, symbol: c.symbol, flow24hUsd: c.flow24hUsd! }));
    const topBurn24h = sortedBy24h.slice(-5).reverse().filter((c) => c.flow24hUsd! < 0)
      .map((c) => ({ id: c.id, symbol: c.symbol, flow24hUsd: c.flow24hUsd! }));

    return new Response(
      JSON.stringify({
        coins,
        summary: {
          gauge,
          band: gauge != null ? gaugeBand(gauge) : null,
          mint24hUsd,
          burn24hUsd,
          net24hUsd,
          net7dUsd,
          net30dUsd,
          topMint24h,
          topBurn24h,
          coinsIncluded: coins.length,
        },
        methodology: { version: FLOWS_VERSION.currentVersion },
        updatedAt: cached.updatedAt,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, max-age=60",
          "X-Methodology-Version": FLOWS_VERSION.currentVersion,
        },
      },
    );
  } catch (err) {
    console.error("[flows] failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
