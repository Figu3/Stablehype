import { setCache } from "../lib/db";
import { derivePegRates, getPegReference } from "../../../src/lib/peg-rates";
import { TRACKED_STABLECOINS } from "../../../src/lib/stablecoins";
import type { StablecoinData } from "../../../src/lib/types";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";
const DEFILLAMA_COINS = "https://coins.llama.fi";
const DEFILLAMA_API = "https://api.llama.fi";

interface GoldTokenConfig {
  internalId: string;
  geckoId: string;
  protocolSlug: string;
  name: string;
  symbol: string;
  goldOunces: number; // troy ounces per token (1 for XAUT/PAXG, 1/31.1035 for gram tokens)
}

const GOLD_TOKENS: GoldTokenConfig[] = [
  { internalId: "gold-xaut", geckoId: "tether-gold", protocolSlug: "tether-gold", name: "Tether Gold", symbol: "XAUT", goldOunces: 1 },
  { internalId: "gold-paxg", geckoId: "pax-gold", protocolSlug: "paxos-gold", name: "PAX Gold", symbol: "PAXG", goldOunces: 1 },
  { internalId: "gold-kau", geckoId: "kinesis-gold", protocolSlug: "", name: "Kinesis Gold", symbol: "KAU", goldOunces: 1 / 31.1035 },
  { internalId: "gold-xaum", geckoId: "matrixdock-gold", protocolSlug: "", name: "Matrixdock Gold", symbol: "XAUm", goldOunces: 1 },
];

interface DefiLlamaCoinPrice {
  price: number;
  symbol: string;
  timestamp: number;
  confidence: number;
}

async function fetchGoldTokens(): Promise<unknown[]> {
  try {
    // Fetch prices from DefiLlama coins API
    const coinIds = GOLD_TOKENS.map((t) => `coingecko:${t.geckoId}`).join(",");
    const priceRes = await fetch(`${DEFILLAMA_COINS}/prices/current/${coinIds}`);
    if (!priceRes.ok) {
      console.error(`[gold] Price fetch failed: ${priceRes.status}`);
      return [];
    }
    const priceData = (await priceRes.json()) as { coins: Record<string, DefiLlamaCoinPrice> };

    // Fetch market caps from DefiLlama protocol API (only for tokens with protocolSlug)
    const mcapMap: Record<string, number> = {};
    const protocolFetches = GOLD_TOKENS
      .filter((t) => t.protocolSlug)
      .map(async (t) => {
        try {
          const res = await fetch(`${DEFILLAMA_API}/protocol/${t.protocolSlug}`);
          if (!res.ok) return;
          const data = (await res.json()) as { mcap?: number };
          if (data.mcap) mcapMap[t.internalId] = data.mcap;
        } catch {
          // Skip this token
        }
      });
    await Promise.all(protocolFetches);

    return GOLD_TOKENS
      .map((token) => {
        const priceInfo = priceData.coins[`coingecko:${token.geckoId}`];
        if (!priceInfo) return null;

        // Use protocol mcap if available, otherwise estimate from price
        // For tokens without protocol data, we skip them (no reliable mcap source)
        const mcap = mcapMap[token.internalId];
        if (!mcap) {
          console.log(`[gold] No mcap for ${token.symbol}, skipping`);
          return null;
        }

        return {
          id: token.internalId,
          name: token.name,
          symbol: token.symbol,
          geckoId: token.geckoId,
          pegType: "peggedGOLD",
          pegMechanism: "rwa-backed",
          price: priceInfo.price,
          priceSource: "defillama",
          circulating: { peggedGOLD: mcap },
          circulatingPrevDay: { peggedGOLD: mcap },
          circulatingPrevWeek: { peggedGOLD: mcap },
          circulatingPrevMonth: { peggedGOLD: mcap },
          chainCirculating: {},
          chains: ["Ethereum"],
          goldOunces: token.goldOunces,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
  } catch (err) {
    console.error("[gold] fetchGoldTokens failed:", err);
    return [];
  }
}

interface PeggedAsset {
  id: string;
  name: string;
  symbol: string;
  address?: string;
  geckoId?: string;
  price?: number | null;
  [key: string]: unknown;
}

/**
 * Enrich assets that are missing prices by fetching from the DefiLlama coins API.
 * Two-pass approach:
 *   1. Contract addresses (ethereum: or solana: prefix) — most reliable
 *   2. CoinGecko IDs — fallback for coins where contract lookup fails
 */
function hasMissingPrice(a: PeggedAsset): boolean {
  return a.price == null || typeof a.price !== "number" || a.price === 0;
}

async function enrichMissingPrices(assets: PeggedAsset[]): Promise<void> {
  // Pass 1: contract addresses via DefiLlama coins API
  const withAddress: { index: number; coinId: string }[] = [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    if (!hasMissingPrice(a) || !a.address) continue;
    const isEvm = a.address.startsWith("0x");
    const coinId = isEvm ? `ethereum:${a.address}` : `solana:${a.address}`;
    withAddress.push({ index: i, coinId });
  }

  let enriched = 0;

  try {
    if (withAddress.length > 0) {
      const coinIds = withAddress.map((m) => m.coinId).join(",");
      const res = await fetch(`${DEFILLAMA_COINS}/prices/current/${coinIds}`);
      if (res.ok) {
        const data = (await res.json()) as { coins: Record<string, DefiLlamaCoinPrice> };
        for (const m of withAddress) {
          const priceInfo = data.coins[m.coinId];
          if (priceInfo?.price != null && priceInfo.price > 0) {
            assets[m.index].price = priceInfo.price;
            enriched++;
          }
        }
      }
    }

    // Pass 2: CoinGecko IDs via DefiLlama proxy for anything still missing
    const geckoPass: { index: number; geckoId: string }[] = [];
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      if (!hasMissingPrice(a)) continue;
      const geckoId = a.geckoId as string | undefined;
      if (geckoId && !geckoId.includes("wrong")) {
        geckoPass.push({ index: i, geckoId });
      }
    }

    const afterPass2: { index: number; geckoId: string }[] = [];
    if (geckoPass.length > 0) {
      const geckoIds = geckoPass.map((m) => `coingecko:${m.geckoId}`).join(",");
      const geckoRes = await fetch(`${DEFILLAMA_COINS}/prices/current/${geckoIds}`);
      if (geckoRes.ok) {
        const geckoData = (await geckoRes.json()) as { coins: Record<string, DefiLlamaCoinPrice> };
        for (const m of geckoPass) {
          const priceInfo = geckoData.coins[`coingecko:${m.geckoId}`];
          if (priceInfo?.price != null && priceInfo.price > 0) {
            assets[m.index].price = priceInfo.price;
            enriched++;
          } else {
            afterPass2.push(m);
          }
        }
      } else {
        afterPass2.push(...geckoPass);
      }
    }

    // Pass 3: CoinGecko direct API for coins DefiLlama doesn't track at all
    if (afterPass2.length > 0) {
      const ids = afterPass2.map((m) => m.geckoId).join(",");
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { headers: { "Accept": "application/json", "User-Agent": "stablecoin-dashboard/1.0" } }
      );
      if (cgRes.ok) {
        const cgData = (await cgRes.json()) as Record<string, { usd?: number }>;
        for (const m of afterPass2) {
          if (cgData[m.geckoId]?.usd != null) {
            assets[m.index].price = cgData[m.geckoId].usd!;
            enriched++;
          }
        }
      }
    }

    if (enriched > 0) {
      console.log(`[sync-stablecoins] Enriched prices for ${enriched} assets`);
    }
  } catch (err) {
    console.warn("[sync-stablecoins] Price enrichment failed:", err);
  }
}

export async function syncStablecoins(db: D1Database): Promise<void> {
  const [llamaRes, goldTokens] = await Promise.all([
    fetch(`${DEFILLAMA_BASE}/stablecoins?includePrices=true`),
    fetchGoldTokens(),
  ]);

  if (!llamaRes.ok) {
    console.error(`[sync-stablecoins] DefiLlama API error: ${llamaRes.status}`);
    return;
  }

  const llamaData = await llamaRes.json() as { peggedAssets: PeggedAsset[] };

  if (!llamaData.peggedAssets || llamaData.peggedAssets.length < 50) {
    console.error(`[sync-stablecoins] Unexpected asset count (${llamaData.peggedAssets?.length}), skipping cache write`);
    return;
  }

  if (goldTokens.length) {
    llamaData.peggedAssets = [...llamaData.peggedAssets, ...goldTokens as PeggedAsset[]];
  }

  // Patch known missing geckoIds so enrichMissingPrices can resolve them
  const GECKO_ID_OVERRIDES: Record<string, string> = {
    "226": "frankencoin",              // ZCHF — DefiLlama price intermittently returns 0
  };
  for (const asset of llamaData.peggedAssets) {
    if (!asset.geckoId && GECKO_ID_OVERRIDES[asset.id]) {
      asset.geckoId = GECKO_ID_OVERRIDES[asset.id];
    }
  }

  // Enrich any assets that DefiLlama didn't provide prices for
  await enrichMissingPrices(llamaData.peggedAssets);

  await setCache(db, "stablecoins", JSON.stringify(llamaData));
  console.log(`[sync-stablecoins] Cached ${llamaData.peggedAssets.length} assets`);

  // Detect depeg events from current price data
  try {
    await detectDepegEvents(db, llamaData.peggedAssets as unknown as StablecoinData[]);
  } catch (err) {
    console.error("[sync-stablecoins] Depeg detection failed:", err);
  }
}

// --- Depeg event detection ---

const DEPEG_THRESHOLD_BPS = 100; // 1%

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

async function detectDepegEvents(db: D1Database, assets: StablecoinData[]): Promise<void> {
  const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
  const pegRates = derivePegRates(assets, metaById);
  const now = Math.floor(Date.now() / 1000);

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
      // Absorb worse peak deviation into the keeper
      if (Math.abs(dupe.peak_deviation_bps) > Math.abs(keeper.peak_deviation_bps)) {
        keeper.peak_deviation_bps = dupe.peak_deviation_bps;
        keeper.peak_price = dupe.peak_price;
      }
      mergeStmts.push(
        db.prepare("DELETE FROM depeg_events WHERE id = ?").bind(dupe.id)
      );
    }
    // Update keeper's peak in DB
    mergeStmts.push(
      db.prepare("UPDATE depeg_events SET peak_deviation_bps = ?, peak_price = ? WHERE id = ?")
        .bind(keeper.peak_deviation_bps, keeper.peak_price, keeper.id)
    );
    openEvents.set(coinId, keeper);
  }
  if (mergeStmts.length > 0) {
    await db.batch(mergeStmts);
    console.log(`[depeg] Merged duplicate open events, ${mergeStmts.length} DB ops`);
  }

  // Track which open events we've seen (to close orphans)
  const seen = new Set<string>();

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

    const bps = Math.round(((price / pegRef) - 1) * 10000);
    const absBps = Math.abs(bps);
    const direction = bps >= 0 ? "above" : "below";
    const existing = openEvents.get(asset.id);

    if (absBps >= DEPEG_THRESHOLD_BPS) {
      if (existing) {
        seen.add(asset.id);
        // Update peak if this deviation is worse
        if (absBps > Math.abs(existing.peak_deviation_bps)) {
          stmts.push(
            db.prepare(
              "UPDATE depeg_events SET peak_deviation_bps = ?, peak_price = ? WHERE id = ?"
            ).bind(bps, price, existing.id)
          );
        }
      } else {
        // Open new event
        stmts.push(
          db.prepare(
            `INSERT INTO depeg_events (stablecoin_id, symbol, peg_type, direction, peak_deviation_bps, started_at, start_price, peak_price, peg_reference, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'live')`
          ).bind(asset.id, asset.symbol, asset.pegType ?? "", direction, bps, now, price, price, pegRef)
        );
        seen.add(asset.id);
      }
    } else if (existing) {
      // Price recovered — close the event
      seen.add(asset.id);
      stmts.push(
        db.prepare(
          "UPDATE depeg_events SET ended_at = ?, recovery_price = ? WHERE id = ?"
        ).bind(now, price, existing.id)
      );
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
    console.log(`[depeg] Wrote ${stmts.length} depeg event updates`);
  }
}
