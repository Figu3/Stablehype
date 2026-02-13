import { TRACKED_STABLECOINS } from "../../../src/lib/stablecoins";
import { derivePegRates, getPegReference } from "../../../src/lib/peg-rates";
import { getCache } from "../lib/db";
import type { StablecoinData } from "../../../src/lib/types";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";
const DEPEG_THRESHOLD_BPS = 100;
const BATCH_SIZE = 40;

interface HistoryPoint {
  date: string;
  totalCirculating: Record<string, number>;
  totalCirculatingUSD: Record<string, number>;
}

export async function handleBackfillDepegs(db: D1Database, url: URL): Promise<Response> {
  const singleId = url.searchParams.get("stablecoin");

  let coins;
  if (singleId) {
    // Single-coin mode: ?stablecoin=22
    const match = TRACKED_STABLECOINS.filter((c) => c.id === singleId);
    if (match.length === 0) {
      return new Response(JSON.stringify({ error: "Stablecoin not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    coins = match;
  } else {
    // Batch mode: ?batch=0
    const batch = parseInt(url.searchParams.get("batch") ?? "0", 10);
    const start = batch * BATCH_SIZE;
    coins = TRACKED_STABLECOINS.slice(start, start + BATCH_SIZE);
  }

  if (coins.length === 0) {
    return new Response(JSON.stringify({ message: "No coins in this batch" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get current peg rates from cached stablecoin data
  const cached = await getCache(db, "stablecoins");
  let pegRates: Record<string, number> = { peggedUSD: 1 };
  if (cached) {
    try {
      const data = JSON.parse(cached.value) as { peggedAssets: StablecoinData[] };
      const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
      pegRates = derivePegRates(data.peggedAssets, metaById);
    } catch {
      // Fall back to USD=1 only
    }
  }

  let totalEvents = 0;
  const errors: string[] = [];

  for (const meta of coins) {
    if (meta.flags.navToken) continue;

    // Skip gold tokens — they use synthetic IDs not in DefiLlama stablecoin API
    if (meta.id.startsWith("gold-")) continue;

    try {
      const res = await fetch(`${DEFILLAMA_BASE}/stablecoin/${encodeURIComponent(meta.id)}`);
      if (!res.ok) {
        errors.push(`${meta.symbol}: HTTP ${res.status}`);
        continue;
      }

      const detail = (await res.json()) as { tokens?: HistoryPoint[] };
      const tokens = detail.tokens;
      if (!tokens || tokens.length === 0) continue;

      const pegRef = getPegReference(
        `pegged${meta.flags.pegCurrency}`,
        pegRates,
        meta.goldOunces
      );
      if (pegRef <= 0) continue;

      const events = extractDepegEvents(tokens, meta.symbol, pegRef, `pegged${meta.flags.pegCurrency}`);

      if (events.length > 0) {
        // Delete existing backfill events for this coin to allow re-runs
        await db
          .prepare("DELETE FROM depeg_events WHERE stablecoin_id = ? AND source = 'backfill'")
          .bind(meta.id)
          .run();

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

function extractDepegEvents(
  tokens: HistoryPoint[],
  symbol: string,
  pegRef: number,
  pegType: string
): BackfillEvent[] {
  const events: BackfillEvent[] = [];
  let current: BackfillEvent | null = null;

  for (const point of tokens) {
    const timestamp = parseInt(point.date, 10);
    if (isNaN(timestamp)) continue;

    // Implied price = totalCirculatingUSD / totalCirculating for the peg type
    const usdVal = point.totalCirculatingUSD
      ? Object.values(point.totalCirculatingUSD).reduce((s, v) => s + (v ?? 0), 0)
      : 0;
    const nativeVal = point.totalCirculating
      ? Object.values(point.totalCirculating).reduce((s, v) => s + (v ?? 0), 0)
      : 0;

    if (nativeVal <= 0 || usdVal <= 0) continue;

    // Skip points with very low supply (< $1M)
    if (usdVal < 1_000_000) continue;

    const impliedPrice = usdVal / nativeVal;
    const bps = Math.round(((impliedPrice / pegRef) - 1) * 10000);
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
          startPrice: impliedPrice,
          peakPrice: impliedPrice,
          recoveryPrice: null,
        };
      } else {
        // Update peak if worse
        if (absBps > Math.abs(current.peakDeviationBps)) {
          current.peakDeviationBps = bps;
          current.peakPrice = impliedPrice;
        }
      }
    } else if (current) {
      // Recovery — close the event
      current.endedAt = timestamp;
      current.recoveryPrice = impliedPrice;
      events.push(current);
      current = null;
    }
  }

  // If still depegged at end of history, close with last timestamp
  if (current) {
    // Leave endedAt null = ongoing (or close if data is old)
    const lastDate = parseInt(tokens[tokens.length - 1].date, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - lastDate > 7 * 86400) {
      // Data older than 7 days — close the event
      current.endedAt = lastDate;
    }
    events.push(current);
  }

  return events;
}
