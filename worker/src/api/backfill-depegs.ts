import { TRACKED_STABLECOINS } from "../../../src/lib/stablecoins";
import { derivePegRates, getPegReference } from "../../../src/lib/peg-rates";
import { getCache } from "../lib/db";
import type { StablecoinData, StablecoinMeta } from "../../../src/lib/types";

const DEFILLAMA_COINS = "https://coins.llama.fi";
const DEFILLAMA_BASE = "https://stablecoins.llama.fi";
const DEPEG_THRESHOLD_BPS = 100;
const BATCH_SIZE = 10; // 3 fetches per coin → 30 subrequests max per batch

interface PricePoint {
  timestamp: number;
  price: number;
}

interface SupplyPoint {
  date: string;
  circulating?: Record<string, number>;
}

export async function handleBackfillDepegs(db: D1Database, url: URL): Promise<Response> {
  const singleId = url.searchParams.get("stablecoin");

  let coins;
  if (singleId) {
    const match = TRACKED_STABLECOINS.filter((c) => c.id === singleId);
    if (match.length === 0) {
      return new Response(JSON.stringify({ error: "Stablecoin not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    coins = match;
  } else {
    const batch = parseInt(url.searchParams.get("batch") ?? "0", 10);
    const start = batch * BATCH_SIZE;
    coins = TRACKED_STABLECOINS.slice(start, start + BATCH_SIZE);
  }

  if (coins.length === 0) {
    return new Response(JSON.stringify({ message: "No coins in this batch" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get peg rates + geckoId map from cached stablecoin data
  const cached = await getCache(db, "stablecoins");
  let pegRates: Record<string, number> = { peggedUSD: 1 };
  const geckoIdMap = new Map<string, string>(); // DefiLlama id → geckoId

  if (cached) {
    try {
      const data = JSON.parse(cached.value) as { peggedAssets: StablecoinData[] };
      const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
      pegRates = derivePegRates(data.peggedAssets, metaById);

      // Build geckoId lookup from the live DefiLlama data
      for (const asset of data.peggedAssets) {
        if (asset.geckoId) {
          geckoIdMap.set(asset.id, asset.geckoId);
        }
      }
    } catch {
      // Fall back to USD=1 only
    }
  }

  // Manual overrides for coins where DefiLlama has wrong/missing geckoId
  const GECKO_OVERRIDES: Record<string, string> = {
    "226": "frankencoin",
  };
  for (const [id, geckoId] of Object.entries(GECKO_OVERRIDES)) {
    geckoIdMap.set(id, geckoId);
  }

  let totalEvents = 0;
  const errors: string[] = [];
  const skipped: string[] = [];

  for (const meta of coins) {
    if (meta.flags.navToken) continue;
    if (meta.id.startsWith("gold-")) continue;

    const geckoId = geckoIdMap.get(meta.id);
    if (!geckoId) {
      skipped.push(meta.symbol);
      continue;
    }

    try {
      const events = await backfillCoin(meta, geckoId, pegRates);

      if (events.length > 0) {
        await db
          .prepare("DELETE FROM depeg_events WHERE stablecoin_id = ? AND source = 'backfill'")
          .bind(meta.id)
          .run();

        const pegRef = getPegReference(
          `pegged${meta.flags.pegCurrency}`,
          pegRates,
          meta.goldOunces
        );

        const stmts = events.map((e) =>
          db.prepare(
            `INSERT INTO depeg_events (stablecoin_id, symbol, peg_type, direction, peak_deviation_bps, started_at, ended_at, start_price, peak_price, recovery_price, peg_reference, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'backfill')`
          ).bind(
            meta.id, meta.symbol, e.pegType, e.direction, e.peakDeviationBps,
            e.startedAt, e.endedAt, e.startPrice, e.peakPrice, e.recoveryPrice, pegRef
          )
        );
        await db.batch(stmts);
        totalEvents += events.length;
      }
    } catch (err) {
      errors.push(`${meta.symbol}: ${err}`);
    }
  }

  return new Response(
    JSON.stringify({
      coinsProcessed: coins.length,
      eventsCreated: totalEvents,
      skipped: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

interface BackfillEvent {
  pegType: string;
  direction: string;
  peakDeviationBps: number;
  startedAt: number;
  endedAt: number | null;
  startPrice: number;
  peakPrice: number;
  recoveryPrice: number | null;
}

async function backfillCoin(
  meta: StablecoinMeta,
  geckoId: string,
  pegRates: Record<string, number>
): Promise<BackfillEvent[]> {
  const pegType = `pegged${meta.flags.pegCurrency}`;
  const pegRef = getPegReference(pegType, pegRates, meta.goldOunces);
  if (pegRef <= 0) return [];

  const twoYearsAgo = Math.floor(Date.now() / 1000) - 2 * 365 * 86400;
  const fourYearsAgo = twoYearsAgo - 2 * 365 * 86400;

  const [pricesOld, pricesRecent] = await Promise.all([
    fetchPriceChart(geckoId, fourYearsAgo),
    fetchPriceChart(geckoId, twoYearsAgo),
  ]);

  const priceMap = new Map<number, number>();
  for (const p of [...pricesOld, ...pricesRecent]) {
    priceMap.set(p.timestamp, p.price);
  }
  const prices = Array.from(priceMap.entries())
    .map(([timestamp, price]) => ({ timestamp, price }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (prices.length === 0) return [];

  const supplyByDate = await fetchSupplyData(meta.id);

  return extractDepegEvents(prices, pegRef, pegType, supplyByDate);
}

async function fetchPriceChart(geckoId: string, start: number): Promise<PricePoint[]> {
  try {
    const res = await fetch(
      `${DEFILLAMA_COINS}/chart/coingecko:${geckoId}?start=${start}&span=800&period=1d`,
      { headers: { "User-Agent": "stablecoin-dashboard/1.0" } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      coins: Record<string, { prices: PricePoint[] }>;
    };
    return data.coins?.[`coingecko:${geckoId}`]?.prices ?? [];
  } catch {
    return [];
  }
}

async function fetchSupplyData(id: string): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  try {
    const res = await fetch(`${DEFILLAMA_BASE}/stablecoin/${encodeURIComponent(id)}`);
    if (!res.ok) return map;
    const data = (await res.json()) as { tokens?: SupplyPoint[] };
    for (const point of data.tokens ?? []) {
      const ts = parseInt(point.date, 10);
      if (isNaN(ts)) continue;
      const supply = point.circulating
        ? Object.values(point.circulating).reduce((s, v) => s + (v ?? 0), 0)
        : 0;
      map.set(ts, supply);
    }
  } catch {
    // No supply data — we'll skip the supply filter
  }
  return map;
}

function findNearestSupply(supplyByDate: Map<number, number>, timestamp: number): number | null {
  if (supplyByDate.size === 0) return null;
  let closest: number | null = null;
  let closestDist = Infinity;
  for (const [ts, supply] of supplyByDate) {
    const dist = Math.abs(ts - timestamp);
    if (dist < closestDist) {
      closestDist = dist;
      closest = supply;
    }
    if (ts > timestamp + 7 * 86400) break;
  }
  return closest;
}

function extractDepegEvents(
  prices: PricePoint[],
  pegRef: number,
  pegType: string,
  supplyByDate: Map<number, number>
): BackfillEvent[] {
  const events: BackfillEvent[] = [];
  let current: BackfillEvent | null = null;

  for (const point of prices) {
    const { timestamp, price } = point;
    if (price <= 0) continue;

    if (supplyByDate.size > 0) {
      const supply = findNearestSupply(supplyByDate, timestamp);
      if (supply !== null && supply < 1_000_000) continue;
    }

    const bps = Math.round(((price / pegRef) - 1) * 10000);
    const absBps = Math.abs(bps);
    const direction = bps >= 0 ? "above" : "below";

    if (absBps >= DEPEG_THRESHOLD_BPS) {
      if (!current) {
        current = {
          pegType,
          direction,
          peakDeviationBps: bps,
          startedAt: timestamp,
          endedAt: null,
          startPrice: price,
          peakPrice: price,
          recoveryPrice: null,
        };
      } else {
        if (absBps > Math.abs(current.peakDeviationBps)) {
          current.peakDeviationBps = bps;
          current.peakPrice = price;
        }
      }
    } else if (current) {
      current.endedAt = timestamp;
      current.recoveryPrice = price;
      events.push(current);
      current = null;
    }
  }

  if (current) {
    const lastTs = prices[prices.length - 1].timestamp;
    const now = Math.floor(Date.now() / 1000);
    if (now - lastTs > 7 * 86400) {
      current.endedAt = lastTs;
    }
    events.push(current);
  }

  return events;
}
