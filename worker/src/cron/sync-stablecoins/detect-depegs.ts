import { derivePegRates, getPegReference } from "@shared/lib/peg-rates";
import { TRACKED_STABLECOINS } from "@shared/lib/stablecoins";
import type { StablecoinData } from "@shared/lib/types";

/** Deviation threshold (in bps) above which a depeg event is opened. */
export const DEPEG_THRESHOLD_BPS = 3; // 0.03%

/** DEX price freshness window (in seconds) for cross-validation gating. */
const DEX_FRESHNESS_SEC = 1200; // 20 minutes

interface DepegRow {
  id: number;
  stablecoin_id: string;
  symbol: string;
  peg_type: string;
  direction: string;
  peak_deviation_bps: number;
  started_at: number;
  ended_at: number | null;
  start_price: number;
  peak_price: number | null;
  recovery_price: number | null;
  peg_reference: number;
  source: string;
}

interface DexPriceRow {
  stablecoin_id: string;
  dex_price_usd: number;
  source_pool_count: number;
  source_total_tvl: number;
  updated_at: number;
}

/**
 * Detect depeg events from current price data and persist opens/closes to D1.
 *
 * Pipeline:
 *   1. Load open events from `depeg_events` (ended_at IS NULL)
 *   2. Merge duplicate opens (keep earliest, absorb worst peak)
 *   3. For each tracked asset, compare current price to peg reference:
 *      - Above threshold + no existing event → open (gated by DEX cross-check)
 *      - Above threshold + existing event same direction → update peak if worse
 *      - Above threshold + direction change → close old, open new
 *      - Below threshold + existing event → close
 *   4. Batch-write all mutations
 */
export async function detectDepegEvents(
  db: D1Database,
  assets: StablecoinData[],
  fxFallbackRates?: Record<string, number>,
  ethBlock?: number | null,
): Promise<void> {
  const blockNum = ethBlock ?? null;
  const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
  const pegRates = derivePegRates(assets, metaById, fxFallbackRates);
  const now = Math.floor(Date.now() / 1000);

  // Load DEX-implied prices for cross-validation.
  // Wrapped in try/catch for resilience if migration 0011 hasn't been applied yet.
  let dexPrices = new Map<string, DexPriceRow>();
  try {
    const dexPriceResult = await db
      .prepare("SELECT * FROM dex_prices")
      .all<DexPriceRow>();
    dexPrices = new Map((dexPriceResult.results ?? []).map((r) => [r.stablecoin_id, r]));
  } catch {
    // dex_prices table may not exist yet (pre-migration 0011)
  }

  // Load all open events in one query
  const openResult = await db
    .prepare("SELECT * FROM depeg_events WHERE ended_at IS NULL")
    .all<DepegRow>();

  // Group open events by coin — detect duplicates
  const openByCoin = new Map<string, DepegRow[]>();
  for (const row of openResult.results ?? []) {
    const list = openByCoin.get(row.stablecoin_id) ?? [];
    list.push(row);
    openByCoin.set(row.stablecoin_id, list);
  }

  // Merge duplicate open events: keep earliest, absorb worst peak, delete rest
  const mergeStmts: D1PreparedStatement[] = [];
  const openEvents = new Map<string, DepegRow>();
  for (const [coinId, rows] of openByCoin) {
    if (rows.length === 1) {
      openEvents.set(coinId, rows[0]);
      continue;
    }
    // Sort by started_at ascending — keep the earliest event
    rows.sort((a, b) => a.started_at - b.started_at);
    const keeper = rows[0];
    for (let i = 1; i < rows.length; i++) {
      const dupe = rows[i];
      if (Math.abs(dupe.peak_deviation_bps) > Math.abs(keeper.peak_deviation_bps)) {
        keeper.peak_deviation_bps = dupe.peak_deviation_bps;
        keeper.peak_price = dupe.peak_price;
      }
      mergeStmts.push(db.prepare("DELETE FROM depeg_events WHERE id = ?").bind(dupe.id));
    }
    mergeStmts.push(
      db
        .prepare("UPDATE depeg_events SET peak_deviation_bps = ?, peak_price = ? WHERE id = ?")
        .bind(keeper.peak_deviation_bps, keeper.peak_price, keeper.id),
    );
    openEvents.set(coinId, keeper);
  }
  if (mergeStmts.length > 0) {
    await db.batch(mergeStmts);
    console.log(`[depeg] Merged duplicate open events, ${mergeStmts.length} DB ops`);
  }

  const stmts: D1PreparedStatement[] = [];

  for (const asset of assets) {
    const meta = metaById.get(asset.id);
    if (!meta) continue; // not tracked
    if (meta.flags.navToken) continue; // skip NAV tokens

    const price = asset.price;
    if (price == null || typeof price !== "number" || isNaN(price) || price <= 0) continue;

    const supply = asset.circulating
      ? Object.values(asset.circulating).reduce((s, v) => s + (v ?? 0), 0)
      : 0;
    if (supply < 1_000_000) continue;

    const pegRef = getPegReference(asset.pegType, pegRates, meta.goldOunces);
    if (pegRef <= 0) continue;

    const bps = Math.round((price / pegRef - 1) * 10000);
    const absBps = Math.abs(bps);
    const direction = bps >= 0 ? "above" : "below";
    const existing = openEvents.get(asset.id);

    if (absBps >= DEPEG_THRESHOLD_BPS) {
      if (existing) {
        if (existing.direction !== direction) {
          // Direction change: close old event and open a new one
          stmts.push(
            db
              .prepare(
                "UPDATE depeg_events SET ended_at = ?, recovery_price = ?, end_block = ? WHERE id = ?",
              )
              .bind(now, price, blockNum, existing.id),
          );
          stmts.push(
            db
              .prepare(
                `INSERT INTO depeg_events (stablecoin_id, symbol, peg_type, direction, peak_deviation_bps, started_at, start_price, peak_price, peg_reference, source, start_block)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?)`,
              )
              .bind(asset.id, asset.symbol, asset.pegType ?? "", direction, bps, now, price, price, pegRef, blockNum),
          );
        } else if (absBps > Math.abs(existing.peak_deviation_bps)) {
          // Same direction — update peak if this deviation is worse
          stmts.push(
            db
              .prepare("UPDATE depeg_events SET peak_deviation_bps = ?, peak_price = ? WHERE id = ?")
              .bind(bps, price, existing.id),
          );
        }
      } else {
        // Open new event — check DEX price cross-validation first
        const dexRow = dexPrices.get(asset.id);
        const dexFresh = dexRow && now - dexRow.updated_at < DEX_FRESHNESS_SEC;
        if (dexFresh) {
          const dexBps = Math.abs(
            Math.round((dexRow.dex_price_usd / pegRef - 1) * 10000),
          );
          if (dexBps < DEPEG_THRESHOLD_BPS) {
            console.log(
              `[depeg] Suppressed new event for ${asset.symbol}: ` +
                `primary=${bps}bps but DEX=${dexBps}bps (${dexRow.source_pool_count} pools, ` +
                `$${(dexRow.source_total_tvl / 1e6).toFixed(1)}M TVL)`,
            );
            continue;
          }
        }
        stmts.push(
          db
            .prepare(
              `INSERT INTO depeg_events (stablecoin_id, symbol, peg_type, direction, peak_deviation_bps, started_at, start_price, peak_price, peg_reference, source, start_block)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?)`,
            )
            .bind(asset.id, asset.symbol, asset.pegType ?? "", direction, bps, now, price, price, pegRef, blockNum),
        );
      }
    } else if (existing) {
      // Price recovered — close the event
      stmts.push(
        db
          .prepare(
            "UPDATE depeg_events SET ended_at = ?, recovery_price = ?, end_block = ? WHERE id = ?",
          )
          .bind(now, price, blockNum, existing.id),
      );
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
    console.log(`[depeg] Wrote ${stmts.length} depeg event updates`);
  }
}
