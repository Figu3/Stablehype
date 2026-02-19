import { setCacheIfNewer, getCache, getPriceCache, savePriceCache } from "../lib/db";
import { fetchWithRetry } from "../lib/fetch-retry";
import { derivePegRates, getPegReference } from "../../../src/lib/peg-rates";
import { TRACKED_STABLECOINS } from "../../../src/lib/stablecoins";
import type { StablecoinData } from "../../../src/lib/types";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";
const DEFILLAMA_COINS = "https://coins.llama.fi";

interface DefiLlamaCoinPrice {
  price: number;
  symbol: string;
  timestamp: number;
  confidence: number;
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
 * Enrich assets that are missing prices via a 4-pass pipeline:
 *   1. Contract addresses via DefiLlama coins API (with multi-chain fallback)
 *   2. CoinGecko IDs via DefiLlama proxy
 *   3. CoinGecko direct API
 *   4. DexScreener search API (best-effort fallback)
 */
function hasMissingPrice(a: PeggedAsset): boolean {
  return a.price == null || typeof a.price !== "number" || a.price === 0;
}

/** Map DL stablecoins API chain names → DL coins API prefixes */
const CHAIN_PREFIX_MAP: Record<string, string> = {
  "Ethereum": "ethereum",
  "Arbitrum": "arbitrum",
  "Polygon": "polygon",
  "BSC": "bsc",
  "Base": "base",
  "Optimism": "optimism",
  "Avalanche": "avax",
};

/** Build the DL coins API identifier from an asset address */
function addressToCoinId(address: string): string {
  if (address.includes(":")) {
    return address; // already prefixed: "megaeth:0x...", "algorand:..."
  } else if (address.startsWith("0x")) {
    return `ethereum:${address}`;
  } else {
    return `solana:${address}`;
  }
}

interface DexScreenerPair {
  baseToken: { symbol: string };
  quoteToken: { symbol: string };
  priceUsd: string;
  liquidity: { usd: number };
  chainId: string;
}

// ── CEX spot price fetchers ──
// Each returns Map<SYMBOL, priceUSD>. All endpoints are public (no auth).
// We fetch all tickers from each exchange in a single request, then extract
// stablecoin prices from pairs quoted in USDT or USD.

interface CexResult { symbol: string; price: number; exchange: string }

async function fetchBinancePrices(): Promise<CexResult[]> {
  const res = await fetch("https://api.binance.com/api/v3/ticker/price");
  if (!res.ok) return [];
  const data = (await res.json()) as { symbol: string; price: string }[];
  const results: CexResult[] = [];
  for (const t of data) {
    // Match pairs ending in USDT (e.g. USDCUSDT, DAIUSDT, FDUSDUSDT)
    if (t.symbol.endsWith("USDT")) {
      const base = t.symbol.slice(0, -4);
      const price = parseFloat(t.price);
      if (!isNaN(price) && price > 0) {
        results.push({ symbol: base, price, exchange: "binance" });
      }
    }
  }
  return results;
}

async function fetchCoinbasePrices(): Promise<CexResult[]> {
  // Coinbase Advanced Trade API: public tickers for all products
  const res = await fetch("https://api.exchange.coinbase.com/products", {
    headers: { "User-Agent": "stablecoin-dashboard/1.0" },
  });
  if (!res.ok) return [];
  const products = (await res.json()) as { id: string; base_currency: string; quote_currency: string; status: string }[];
  // Filter to USD-quoted, online products
  const usdProducts = products.filter(
    (p) => p.quote_currency === "USD" && p.status === "online"
  );

  const results: CexResult[] = [];
  // Batch into groups of 10 to avoid rate limits (3 req/s)
  const BATCH = 10;
  for (let i = 0; i < usdProducts.length; i += BATCH) {
    const batch = usdProducts.slice(i, i + BATCH);
    const fetches = batch.map(async (p) => {
      try {
        const r = await fetch(`https://api.exchange.coinbase.com/products/${p.id}/ticker`, {
          headers: { "User-Agent": "stablecoin-dashboard/1.0" },
        });
        if (!r.ok) return null;
        const d = (await r.json()) as { price: string };
        const price = parseFloat(d.price);
        if (!isNaN(price) && price > 0) {
          return { symbol: p.base_currency.toUpperCase(), price, exchange: "coinbase" } as CexResult;
        }
      } catch { /* skip */ }
      return null;
    });
    const batch_results = await Promise.all(fetches);
    for (const r of batch_results) {
      if (r) results.push(r);
    }
  }
  return results;
}

async function fetchBitfinexPrices(): Promise<CexResult[]> {
  const res = await fetch("https://api-pub.bitfinex.com/v2/tickers?symbols=ALL");
  if (!res.ok) return [];
  // Response: array of arrays. Trading pairs: [SYMBOL, BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_RELATIVE, LAST_PRICE, VOLUME, HIGH, LOW]
  const data = (await res.json()) as (string | number)[][];
  const results: CexResult[] = [];
  for (const t of data) {
    const sym = t[0] as string;
    // Trading pairs start with 't', we want USD-quoted pairs (e.g. tUSDCUSD, tDAIUSD)
    if (typeof sym === "string" && sym.startsWith("t") && sym.endsWith("USD") && !sym.endsWith("USDT")) {
      // Symbols can be 7 chars (tXXXUSD) or longer for longer names (tUSDCUSD)
      const base = sym.slice(1, -3); // strip 't' prefix and 'USD' suffix
      const lastPrice = t[7] as number;
      if (typeof lastPrice === "number" && lastPrice > 0) {
        results.push({ symbol: base.toUpperCase(), price: lastPrice, exchange: "bitfinex" });
      }
    }
    // Also match USDT-quoted pairs
    if (typeof sym === "string" && sym.startsWith("t") && sym.endsWith("USDT")) {
      const base = sym.slice(1, -4);
      const lastPrice = t[7] as number;
      if (typeof lastPrice === "number" && lastPrice > 0) {
        results.push({ symbol: base.toUpperCase(), price: lastPrice, exchange: "bitfinex" });
      }
    }
  }
  return results;
}

async function fetchBybitPrices(): Promise<CexResult[]> {
  const res = await fetch("https://api.bybit.com/v5/market/tickers?category=spot");
  if (!res.ok) return [];
  const data = (await res.json()) as {
    result: { list: { symbol: string; lastPrice: string }[] };
  };
  const results: CexResult[] = [];
  for (const t of data.result?.list ?? []) {
    if (t.symbol.endsWith("USDT")) {
      const base = t.symbol.slice(0, -4);
      const price = parseFloat(t.lastPrice);
      if (!isNaN(price) && price > 0) {
        results.push({ symbol: base, price, exchange: "bybit" });
      }
    }
  }
  return results;
}

async function fetchOkxPrices(): Promise<CexResult[]> {
  const res = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT");
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data: { instId: string; last: string }[];
  };
  const results: CexResult[] = [];
  for (const t of data.data ?? []) {
    // OKX format: USDC-USDT, DAI-USDT, etc.
    if (t.instId.endsWith("-USDT")) {
      const base = t.instId.slice(0, -5);
      const price = parseFloat(t.last);
      if (!isNaN(price) && price > 0) {
        results.push({ symbol: base.toUpperCase(), price, exchange: "okx" });
      }
    }
  }
  return results;
}

/**
 * Fetch prices from 5 CEX exchanges in parallel, deduplicate by taking
 * the median price when multiple exchanges list the same symbol.
 */
async function fetchCexPrices(): Promise<Map<string, number>> {
  const [binance, coinbase, bitfinex, bybit, okx] = await Promise.all([
    fetchBinancePrices().catch(() => [] as CexResult[]),
    fetchCoinbasePrices().catch(() => [] as CexResult[]),
    fetchBitfinexPrices().catch(() => [] as CexResult[]),
    fetchBybitPrices().catch(() => [] as CexResult[]),
    fetchOkxPrices().catch(() => [] as CexResult[]),
  ]);

  // Group all prices by symbol
  const bySymbol = new Map<string, number[]>();
  for (const r of [...binance, ...coinbase, ...bitfinex, ...bybit, ...okx]) {
    const list = bySymbol.get(r.symbol) ?? [];
    list.push(r.price);
    bySymbol.set(r.symbol, list);
  }

  // Take median price per symbol for robustness
  const result = new Map<string, number>();
  for (const [sym, prices] of bySymbol) {
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];
    result.set(sym, median);
  }

  const totalExchanges = [binance, coinbase, bitfinex, bybit, okx].filter((e) => e.length > 0).length;
  console.log(`[enrich] CEX pass: ${result.size} symbols from ${totalExchanges}/5 exchanges`);
  return result;
}

async function enrichMissingPrices(assets: PeggedAsset[]): Promise<void> {
  const totalMissing = assets.filter(hasMissingPrice).length;
  if (totalMissing === 0) return;

  let pass1Count = 0;
  let pass1bCount = 0;
  let pass2Count = 0;
  let pass3Count = 0;
  let pass4Count = 0;

  try {
    // ── Pass 1: Contract addresses via DefiLlama coins API ──
    const withAddress: { index: number; coinId: string }[] = [];
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      if (!hasMissingPrice(a) || !a.address) continue;
      withAddress.push({ index: i, coinId: addressToCoinId(a.address) });
    }

    if (withAddress.length > 0) {
      const coinIds = withAddress.map((m) => m.coinId).join(",");
      const res = await fetch(`${DEFILLAMA_COINS}/prices/current/${coinIds}`);
      if (res.ok) {
        const data = (await res.json()) as { coins: Record<string, DefiLlamaCoinPrice> };
        for (const m of withAddress) {
          const priceInfo = data.coins[m.coinId];
          if (priceInfo?.price != null && priceInfo.price > 0) {
            assets[m.index].price = priceInfo.price;
            pass1Count++;
          }
        }
      }
    }

    // ── Pass 1b: Multi-chain fallback for 0x addresses still missing ──
    const stillMissingAddr = withAddress.filter(
      (m) => hasMissingPrice(assets[m.index]) && m.coinId.startsWith("ethereum:")
    );
    if (stillMissingAddr.length > 0) {
      // Build alternate chain coinIds from the asset's chains field
      const altLookups: { index: number; coinId: string }[] = [];
      for (const m of stillMissingAddr) {
        const a = assets[m.index];
        const chains = a.chains as string[] | undefined;
        if (!chains || !a.address) continue;
        const addr = a.address;
        for (const chain of chains) {
          if (chain === "Ethereum") continue; // already tried
          const prefix = CHAIN_PREFIX_MAP[chain];
          if (prefix) {
            altLookups.push({ index: m.index, coinId: `${prefix}:${addr}` });
          }
        }
      }

      if (altLookups.length > 0) {
        const coinIds = altLookups.map((m) => m.coinId).join(",");
        const res = await fetch(`${DEFILLAMA_COINS}/prices/current/${coinIds}`);
        if (res.ok) {
          const data = (await res.json()) as { coins: Record<string, DefiLlamaCoinPrice> };
          const resolved = new Set<number>(); // avoid double-count
          for (const m of altLookups) {
            if (resolved.has(m.index)) continue;
            const priceInfo = data.coins[m.coinId];
            if (priceInfo?.price != null && priceInfo.price > 0) {
              assets[m.index].price = priceInfo.price;
              pass1bCount++;
              resolved.add(m.index);
            }
          }
        }
      }
    }

    // ── Pass 2: CoinGecko IDs via DefiLlama proxy ──
    const geckoPass: { index: number; geckoId: string }[] = [];
    const wrongGeckoPass: { index: number; geckoId: string }[] = [];
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      if (!hasMissingPrice(a)) continue;
      const geckoId = a.geckoId as string | undefined;
      if (!geckoId) continue;
      if (geckoId.includes("wrong")) {
        // Strip "wrong" suffix to get the real geckoId for Pass 3
        const cleanId = geckoId.replace(/-?wrong-?/g, "").replace(/-$/, "");
        if (cleanId) wrongGeckoPass.push({ index: i, geckoId: cleanId });
      } else {
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
            pass2Count++;
          } else {
            afterPass2.push(m);
          }
        }
      } else {
        afterPass2.push(...geckoPass);
      }
    }
    // "wrong" geckoIds skip Pass 2 but go straight to Pass 3
    afterPass2.push(...wrongGeckoPass);

    // ── Pass 3: CoinGecko direct API ──
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
            pass3Count++;
          }
        }
      } else {
        console.warn(`[enrich] CoinGecko API returned ${cgRes.status}`);
      }
    }

    // ── Pass 4: DexScreener search API (best-effort fallback) ──
    const stillMissing = assets
      .map((a, i) => ({ asset: a, index: i }))
      .filter((m) => hasMissingPrice(m.asset));

    for (const m of stillMissing) {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(m.asset.symbol)}`,
          { headers: { "User-Agent": "stablecoin-dashboard/1.0" } }
        );
        if (!res.ok) {
          console.warn(`[enrich] DexScreener returned ${res.status} for ${m.asset.symbol}`);
          continue;
        }
        const data = (await res.json()) as { pairs?: DexScreenerPair[] };
        if (!data.pairs || data.pairs.length === 0) continue;

        // Filter: matching symbol, has USD price, >$50K liquidity
        const candidates = data.pairs.filter((p) => {
          if (p.baseToken.symbol.toUpperCase() !== m.asset.symbol.toUpperCase()) return false;
          if (!p.priceUsd || !p.liquidity?.usd) return false;
          if (p.liquidity.usd < 50_000) return false;
          return true;
        });

        if (candidates.length === 0) continue;

        // Take price from highest-liquidity pair
        candidates.sort((a, b) => b.liquidity.usd - a.liquidity.usd);
        const price = parseFloat(candidates[0].priceUsd);
        // Sanity check: reasonable price range for fiat-pegged stablecoins
        if (!isNaN(price) && price > 0.01 && price < 1000) {
          assets[m.index].price = price;
          pass4Count++;
        }
      } catch (err) {
        console.warn(`[enrich] DexScreener failed for ${m.asset.symbol}:`, err);
      }
    }

    // ── Pass 5: CEX spot prices (Binance, Coinbase, Bitfinex, Bybit, OKX) ──
    let pass5Count = 0;
    try {
      const cexStillMissing = assets
        .map((a, i) => ({ asset: a, index: i }))
        .filter((m) => hasMissingPrice(m.asset));

      if (cexStillMissing.length > 0) {
        const cexPrices = await fetchCexPrices();
        for (const m of cexStillMissing) {
          const sym = m.asset.symbol.toUpperCase();
          const price = cexPrices.get(sym);
          if (price != null && price > 0.01 && price < 1000) {
            assets[m.index].price = price;
            pass5Count++;
          }
        }
      }
    } catch (err) {
      console.warn("[enrich] CEX price pass failed:", err);
    }

    // ── Summary log ──
    const finalMissing = assets.filter(hasMissingPrice).length;
    const totalEnriched = pass1Count + pass1bCount + pass2Count + pass3Count + pass4Count + pass5Count;
    if (totalMissing > 0) {
      console.log(
        `[enrich] ${totalMissing} assets missing prices → ` +
        `Pass 1: +${pass1Count}, Pass 1b (multi-chain): +${pass1bCount}, ` +
        `Pass 2: +${pass2Count}, Pass 3: +${pass3Count}, ` +
        `Pass 4 (DexScreener): +${pass4Count}, Pass 5 (CEX): +${pass5Count}, still missing: ${finalMissing}`
      );
    }
    if (totalEnriched > 0) {
      console.log(`[sync-stablecoins] Enriched prices for ${totalEnriched} assets`);
    }
  } catch (err) {
    console.warn("[sync-stablecoins] Price enrichment failed:", err);
  }
}

/** Guard against corrupted API prices that would break peg deviation calculations */
function isReasonablePrice(price: number, pegType: string | undefined): boolean {
  if (!pegType) return price > 0 && price < 50;
  // USD and EUR pegged stablecoins should be near 1.0
  if (pegType.includes("USD") || pegType.includes("EUR")) {
    return price > 0.01 && price < 50;
  }
  return price > 0 && price < 50;
}

export async function syncStablecoins(db: D1Database): Promise<void> {
  const syncStartSec = Math.floor(Date.now() / 1000);

  const llamaRes = await fetchWithRetry(`${DEFILLAMA_BASE}/stablecoins?includePrices=true`);

  if (!llamaRes || !llamaRes.ok) {
    console.error(`[sync-stablecoins] DefiLlama API error: ${llamaRes?.status ?? "no response"}`);
    return;
  }

  const llamaData = await llamaRes.json() as { peggedAssets: PeggedAsset[]; fxFallbackRates?: Record<string, number> };

  if (!llamaData.peggedAssets || llamaData.peggedAssets.length < 50) {
    console.error(`[sync-stablecoins] Unexpected asset count (${llamaData.peggedAssets?.length}), skipping cache write`);
    return;
  }

  // Structural validation: ensure assets have required fields
  const validAssets = llamaData.peggedAssets.filter(
    (a) => a.id != null && typeof a.name === "string" && typeof a.symbol === "string" && a.circulating != null
  );
  if (validAssets.length < 50) {
    console.error(`[sync-stablecoins] Only ${validAssets.length} valid assets (need 50+), skipping cache write`);
    return;
  }
  if (validAssets.length < llamaData.peggedAssets.length) {
    console.warn(`[sync-stablecoins] Dropped ${llamaData.peggedAssets.length - validAssets.length} malformed assets`);
    llamaData.peggedAssets = validAssets;
  }

  // Patch known missing/wrong geckoIds so enrichMissingPrices can resolve them
  const GECKO_ID_OVERRIDES: Record<string, string> = {
    "269": "liquity-bold-2",           // BOLD — no geckoId in DL stablecoins API
    "255": "aegis-yusd",               // YUSD — no geckoId in DL stablecoins API
    "275": "quantoz-usdq",             // USDQ — no geckoId in DL stablecoins API
    "302": "hylo-usd",                 // HYUSD — no geckoId in DL stablecoins API
    "342": "megausd",                  // USDM (MegaUSD) — no geckoId in DL stablecoins API
    "185": "gyroscope-gyd",            // GYD — no geckoId in DL stablecoins API
  };
  // Patch known missing contract addresses for Pass 1 resolution
  const ADDRESS_OVERRIDES: Record<string, string> = {
    "213": "0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b", // M by M0 — no address in DL stablecoins API
  };
  for (const asset of llamaData.peggedAssets) {
    const geckOverride = GECKO_ID_OVERRIDES[asset.id];
    if (geckOverride && (!asset.geckoId || (asset.geckoId as string).includes("wrong"))) {
      asset.geckoId = geckOverride;
    }
    if (!asset.address && ADDRESS_OVERRIDES[asset.id]) {
      asset.address = ADDRESS_OVERRIDES[asset.id];
    }
  }

  // Enrich any assets that DefiLlama didn't provide prices for
  const missingBefore = new Set(
    llamaData.peggedAssets.filter(hasMissingPrice).map((a) => a.id)
  );
  await enrichMissingPrices(llamaData.peggedAssets);

  // --- Reject unreasonable prices BEFORE caching ---
  // Must run before savePriceCache so bad prices don't persist for 24h
  let rejectedCount = 0;
  for (const asset of llamaData.peggedAssets) {
    if (asset.price != null && typeof asset.price === "number" && !isReasonablePrice(asset.price, asset.pegType as string | undefined)) {
      console.warn(`[sync-stablecoins] Rejected unreasonable price for ${asset.symbol} (id=${asset.id}): $${asset.price}`);
      asset.price = null;
      rejectedCount++;
    }
  }
  if (rejectedCount > 0) {
    console.log(`[sync-stablecoins] Rejected ${rejectedCount} unreasonable prices`);
  }

  // --- Price cache: save successes, apply fallbacks ---
  const PRICE_CACHE_TTL = 24 * 60 * 60; // 24 hours
  const now = Math.floor(Date.now() / 1000);

  // Save: coins that were missing but enrichment resolved (and passed validation)
  const enriched = llamaData.peggedAssets.filter(
    (a) => missingBefore.has(a.id) && !hasMissingPrice(a)
  );
  if (enriched.length > 0) {
    await savePriceCache(db, enriched.map((a) => ({ id: a.id, price: a.price! as number })));
  }

  // Fallback: coins still missing — apply cached price if within TTL
  const stillMissing = llamaData.peggedAssets.filter(
    (a) => missingBefore.has(a.id) && hasMissingPrice(a)
  );
  if (stillMissing.length > 0) {
    const priceCache = await getPriceCache(db);
    let fallbackCount = 0;
    for (const asset of stillMissing) {
      const cached = priceCache.get(asset.id);
      if (cached && (now - cached.updatedAt) < PRICE_CACHE_TTL) {
        asset.price = cached.price;
        fallbackCount++;
      }
    }
    if (fallbackCount > 0) {
      console.log(`[sync-stablecoins] Applied ${fallbackCount} cached fallback prices`);
    }
  }

  // Supply sanity check: skip cache write if total supply is implausibly low
  const trackedIds = new Set(TRACKED_STABLECOINS.map((s) => s.id));
  const totalSupply = llamaData.peggedAssets
    .filter((a) => trackedIds.has(a.id))
    .reduce((sum, a) => {
      const circ = a.circulating as Record<string, number> | undefined;
      return sum + (circ ? Object.values(circ).reduce((s, v) => s + (v ?? 0), 0) : 0);
    }, 0);
  if (totalSupply < 100_000_000_000) {
    console.error(`[sync-stablecoins] Total supply $${(totalSupply / 1e9).toFixed(1)}B is below $100B floor, skipping cache write`);
    return;
  }

  // Embed live FX fallback rates if available
  const fxCache = await getCache(db, "fx-rates");
  if (fxCache) {
    try {
      llamaData.fxFallbackRates = JSON.parse(fxCache.value);
    } catch { /* ignore malformed cache */ }
  }

  await setCacheIfNewer(db, "stablecoins", JSON.stringify(llamaData), syncStartSec);
  console.log(`[sync-stablecoins] Cached ${llamaData.peggedAssets.length} assets (total supply: $${(totalSupply / 1e9).toFixed(1)}B)`);

  // Detect depeg events from current price data
  try {
    await detectDepegEvents(db, llamaData.peggedAssets as unknown as StablecoinData[], llamaData.fxFallbackRates);
  } catch (err) {
    console.error("[sync-stablecoins] Depeg detection failed:", err);
  }
}

// --- Depeg event detection ---

const DEPEG_THRESHOLD_BPS = 5; // 0.05%

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

async function detectDepegEvents(db: D1Database, assets: StablecoinData[], fxFallbackRates?: Record<string, number>): Promise<void> {
  const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
  const pegRates = derivePegRates(assets, metaById, fxFallbackRates);
  const now = Math.floor(Date.now() / 1000);

  // Load DEX-implied prices for cross-validation
  // Wrapped in try/catch for resilience if migration 0011 hasn't been applied yet
  let dexPrices = new Map<string, {
    stablecoin_id: string;
    dex_price_usd: number;
    source_pool_count: number;
    source_total_tvl: number;
    updated_at: number;
  }>();
  try {
    const dexPriceResult = await db
      .prepare("SELECT * FROM dex_prices")
      .all<{
        stablecoin_id: string;
        dex_price_usd: number;
        source_pool_count: number;
        source_total_tvl: number;
        updated_at: number;
      }>();
    dexPrices = new Map(
      (dexPriceResult.results ?? []).map((r) => [r.stablecoin_id, r])
    );
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
        // Direction change: close old event and open a new one
        if (existing.direction !== direction) {
          stmts.push(
            db.prepare(
              "UPDATE depeg_events SET ended_at = ?, recovery_price = ? WHERE id = ?"
            ).bind(now, price, existing.id)
          );
          stmts.push(
            db.prepare(
              `INSERT INTO depeg_events (stablecoin_id, symbol, peg_type, direction, peak_deviation_bps, started_at, start_price, peak_price, peg_reference, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'live')`
            ).bind(asset.id, asset.symbol, asset.pegType ?? "", direction, bps, now, price, price, pegRef)
          );
        } else if (absBps > Math.abs(existing.peak_deviation_bps)) {
          // Same direction — update peak if this deviation is worse
          stmts.push(
            db.prepare(
              "UPDATE depeg_events SET peak_deviation_bps = ?, peak_price = ? WHERE id = ?"
            ).bind(bps, price, existing.id)
          );
        }
      } else {
        // Open new event — check DEX price cross-validation first
        const dexRow = dexPrices.get(asset.id);
        const DEX_FRESHNESS_SEC = 1200; // 20 minutes
        const dexFresh = dexRow && (now - dexRow.updated_at) < DEX_FRESHNESS_SEC;
        if (dexFresh) {
          const dexBps = Math.abs(Math.round(
            ((dexRow.dex_price_usd / pegRef) - 1) * 10000
          ));
          if (dexBps < DEPEG_THRESHOLD_BPS) {
            // DEX contradicts primary — likely false positive, suppress opening
            console.log(
              `[depeg] Suppressed new event for ${asset.symbol}: ` +
              `primary=${bps}bps but DEX=${dexBps}bps (${dexRow.source_pool_count} pools, ` +
              `$${(dexRow.source_total_tvl / 1e6).toFixed(1)}M TVL)`
            );
            continue;
          }
        }
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
