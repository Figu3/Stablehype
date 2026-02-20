/**
 * Cron: sync-price-sources
 * Collects prices from 3 independent source categories:
 *   A. DEX prices — extracted from existing D1 tables (0 external calls)
 *   B. Oracle prices — Chainlink feeds via RouteMesh RPC (~16 calls)
 *   C. CEX prices — CoinGecko tickers API (~80 calls)
 *
 * Writes to `price_sources` table with composite PK (stablecoin_id, source_category, source_name).
 * Runs every 10 minutes alongside dex-liquidity sync.
 */

import { fetchWithRetry } from "../lib/fetch-retry";

// ---------------------------------------------------------------------------
// Chainlink USD price feeds on Ethereum mainnet
// selector: latestRoundData() = 0xfeaf968c
// Returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
// answer is price * 10^8
// ---------------------------------------------------------------------------

interface ChainlinkFeed {
  stablecoinId: string;
  symbol: string;
  feedAddress: string;
}

// IDs are DefiLlama stablecoin IDs — verified against /stablecoins API
const CHAINLINK_FEEDS: ChainlinkFeed[] = [
  { stablecoinId: "1", symbol: "USDT", feedAddress: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D" },
  { stablecoinId: "2", symbol: "USDC", feedAddress: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6" },
  { stablecoinId: "4", symbol: "BUSD", feedAddress: "0x833D8Eb16D306ed1FbB5D7A2E019e106B960965A" },
  { stablecoinId: "5", symbol: "DAI", feedAddress: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9" },
  { stablecoinId: "6", symbol: "FRAX", feedAddress: "0xB9E1E3A9feFf48998E45Fa90847ed4D467E8BcfD" },
  { stablecoinId: "8", symbol: "LUSD", feedAddress: "0x3D7aE7E594f2f2091Ad8798313450130d0Aba3a8" },
  { stablecoinId: "19", symbol: "GUSD", feedAddress: "0xa89f5d2365ce98B3cD68012b6f503ab1416245Fc" },
  { stablecoinId: "11", symbol: "USDP", feedAddress: "0x09023c0DA49Aaf8fc3fA3ADF34C6A7016D38D5e3" },
  { stablecoinId: "7", symbol: "TUSD", feedAddress: "0xec746eCF986E2927Abd291a2A1716c940100f8Ba" },
  { stablecoinId: "120", symbol: "PYUSD", feedAddress: "0x8f1dF6D7F2db73eECE86a18b4381F4707b918FB1" },
  { stablecoinId: "118", symbol: "GHO", feedAddress: "0x3f12643D3f6f874d39C2a4c9f2Cd6f2DbAC877FC" },
  { stablecoinId: "110", symbol: "crvUSD", feedAddress: "0xEEf0C605546958c1f899b6fB336C20671f9cD49F" },
  { stablecoinId: "119", symbol: "FDUSD", feedAddress: "0xfAA9147190c2C2cc5B8387B4f49016bDB3380572" },
  { stablecoinId: "146", symbol: "USDe", feedAddress: "0xa569d910839Ae8865Da8F8e70FfFb0cBA869F961" },
  { stablecoinId: "209", symbol: "USDS", feedAddress: "0xff30586cD0F29eD462364C7e81375FC0C71219b1" },
  { stablecoinId: "50", symbol: "EURC", feedAddress: "0x04F84020Fdf10d9ee64D1dcC2986EDF2F556DA11" },
];

// DefiLlama ID → CoinGecko ID for stablecoins (CEX ticker lookup)
// IDs verified against CoinGecko /coins/markets?category=stablecoins API
const GECKO_ID_MAP: Record<string, string> = {
  // ── Top stablecoins ──
  "1": "tether",                        // USDT
  "2": "usd-coin",                      // USDC
  "4": "binance-usd",                   // BUSD
  "5": "dai",                           // DAI
  "6": "frax",                          // FRAX
  "7": "true-usd",                      // TUSD
  "8": "liquity-usd",                   // LUSD
  "10": "magic-internet-money",         // MIM
  "11": "paxos-standard",              // USDP
  "14": "usdd",                         // USDD
  "15": "dola-usd",                     // DOLA
  "19": "gemini-dollar",               // GUSD (Gemini)
  "20": "alchemix-usd",               // alUSD
  "22": "nusd",                         // sUSD (Synthetix)
  "24": "celo-dollar",                 // cUSD
  "50": "euro-coin",                   // EURC
  "79": "helio-protocol-hay",          // lisUSD
  "101": "monerium-eur-money-2",       // EURe
  "106": "electronic-usd",            // eUSD
  "110": "crvusd",                      // crvUSD
  "118": "gho",                         // GHO
  "119": "first-digital-usd",         // FDUSD
  "120": "paypal-usd",                 // PYUSD
  "146": "ethena-usde",               // USDe
  "147": "anchored-coins-eur",        // aEUR
  "154": "bucket-protocol-buck-stablecoin", // BUCK
  "166": "cygnus-finance-global-usd", // cgUSD
  "168": "f-x-protocol-fxusd",        // fxUSD
  "172": "usdb",                        // USDB (Blast)
  "173": "build-on-bitcoin",          // BUIDL
  "185": "gyroscope-gyd",             // GYD
  "195": "usual-usd",                  // USD0
  "197": "resolv-usr",                 // USR
  "202": "anzen-usdz",                // USDz
  "205": "agora-dollar",              // AUSD
  "209": "usds",                        // USDS (Sky)
  "213": "m-by-m0",                    // M
  "218": "satoshi-stablecoin",         // satUSD
  "219": "astherus-usdf",             // USDF (Astherus)
  "220": "usda-2",                     // USDA (Avalon)
  "221": "usdtb",                       // USDtb
  "225": "zeusd",                       // ZeUSD
  "230": "noon-usn",                   // USN
  "231": "honey-3",                    // HONEY
  "235": "frax-usd",                   // frxUSD
  "237": "hashnote-usyc",             // USYC
  "239": "stablr-euro",               // EURR
  "241": "openeden-open-dollar",       // USDO
  "246": "falcon-finance",            // USDf
  "250": "ripple-usd",                // RLUSD
  "251": "felix-feusd",               // FeUSD
  "252": "standx-dusd",               // DUSD
  "254": "societe-generale-forge-eurcv", // EURCV
  "256": "resupply-usd",              // reUSD (Resupply)
  "262": "usd1-wlfi",                 // USD1
  "263": "usdx-money-usdx",           // USDX (Hex Trust)
  "269": "liquity-bold-2",            // BOLD
  "271": "avant-usd",                 // avUSD
  "272": "ylds",                        // YLDS
  "275": "quantoz-usdq",              // USDQ
  "282": "noble-dollar-usdn",         // USDN
  "284": "mnee-usd-stablecoin",       // MNEE
  "286": "global-dollar",             // USDG
  "290": "straitsx-xusd",             // XUSD
  "296": "cap-usd",                    // cUSD (Cap)
  "302": "hylo-usd",                   // HYUSD
  "303": "mezo-usd",                   // meUSD
  "305": "unity-2",                    // UTY
  "306": "gusd",                        // GUSD (Gate)
  "307": "usd-coinvertible",          // USDCV
  "310": "usx-2",                      // USX (Solstice)
  "313": "metamask-usd",              // MUSD
  "316": "cash-4",                     // CASH
  "321": "usdh-2",                     // USDH
  "325": "eurite",                     // EURI
  "326": "metronome-synth-usd",       // msUSD
  "329": "nectar",                     // NECT
  "332": "precious-metals-usd",       // pmUSD
  "335": "jupusd",                     // JUPUSD
  "336": "united-stables",            // U
  "341": "pleasing-usd",              // PUSD
  "344": "yuzu-usd",                   // YZUSD
  "346": "nusd-2",                     // NUSD
  // ── Yield-bearing / NAV tokens ──
  "129": "ondo-us-dollar-yield",       // USDY
};

const FALLBACK_RPC = "https://eth.llamarpc.com";
const LATEST_ROUND_DATA_SELECTOR = "0xfeaf968c";
const ORACLE_DECIMALS = 1e8;
const STALENESS_THRESHOLD_SEC = 7200; // 2 hours

// ---------------------------------------------------------------------------
// A. DEX prices from existing D1 tables (no external calls)
// ---------------------------------------------------------------------------

interface DexSourceRow {
  stablecoinId: string;
  sourceName: string;
  price: number;
  tvl: number;
  chain?: string;
}

async function collectDexPrices(db: D1Database): Promise<DexSourceRow[]> {
  const sources: DexSourceRow[] = [];

  try {
    // Read per-protocol price observations directly from dex_prices.price_sources_json
    // This contains actual prices from each DEX (Curve usdPrice, Uni V3 token0Price/token1Price)
    const priceResult = await db
      .prepare("SELECT stablecoin_id, price_sources_json FROM dex_prices WHERE price_sources_json IS NOT NULL")
      .all<{ stablecoin_id: string; price_sources_json: string }>();

    for (const row of priceResult.results ?? []) {
      try {
        const priceSources = JSON.parse(row.price_sources_json) as {
          protocol: string;
          chain: string;
          price: number;
          tvl: number;
        }[];

        // Group observations by protocol — each protocol may have multiple pool observations
        // For each protocol, compute TVL-weighted average price across its pools
        const byProtocol = new Map<string, { prices: { price: number; tvl: number }[]; chain: string }>();
        for (const src of priceSources) {
          if (src.price <= 0 || src.price > 10) continue;
          const existing = byProtocol.get(src.protocol);
          if (existing) {
            existing.prices.push({ price: src.price, tvl: src.tvl });
            // Keep the chain of highest TVL observation
            if (src.tvl > (existing.prices[0]?.tvl ?? 0)) {
              existing.chain = src.chain;
            }
          } else {
            byProtocol.set(src.protocol, {
              prices: [{ price: src.price, tvl: src.tvl }],
              chain: src.chain,
            });
          }
        }

        for (const [protocol, data] of byProtocol) {
          // TVL-weighted average price for this protocol
          const totalTvl = data.prices.reduce((s, p) => s + p.tvl, 0);
          const weightedPrice = totalTvl > 0
            ? data.prices.reduce((s, p) => s + p.price * p.tvl, 0) / totalTvl
            : data.prices[0].price;

          sources.push({
            stablecoinId: row.stablecoin_id,
            sourceName: protocol,
            price: Math.round(weightedPrice * 1e6) / 1e6,
            tvl: Math.round(totalTvl),
            chain: data.chain,
          });
        }
      } catch {
        // skip malformed JSON
      }
    }
  } catch (err) {
    console.error("[price-sources] DEX price collection failed:", err);
  }

  return sources;
}

// ---------------------------------------------------------------------------
// B. Oracle prices via Chainlink on-chain reads
// ---------------------------------------------------------------------------

interface OracleResult {
  stablecoinId: string;
  symbol: string;
  price: number;
  feedAddress: string;
  updatedAt: number;
}

async function collectOraclePrices(rpcUrl: string): Promise<OracleResult[]> {
  const results: OracleResult[] = [];
  const nowSec = Math.floor(Date.now() / 1000);

  // Batch in groups of 5 to avoid rate limits
  for (let i = 0; i < CHAINLINK_FEEDS.length; i += 5) {
    const batch = CHAINLINK_FEEDS.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async (feed) => {
        try {
          const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "eth_call",
              params: [
                { to: feed.feedAddress, data: LATEST_ROUND_DATA_SELECTOR },
                "latest",
              ],
              id: 1,
            }),
          });

          if (!res.ok) {
            console.warn(`[price-sources] RPC call failed for ${feed.symbol}: ${res.status}`);
            return null;
          }

          const json = (await res.json()) as { result?: string; error?: { message: string } };
          if (json.error || !json.result || json.result === "0x") {
            console.warn(`[price-sources] RPC error for ${feed.symbol}:`, json.error?.message ?? "empty result");
            return null;
          }

          // Decode latestRoundData response:
          // bytes 0-31: roundId (uint80)
          // bytes 32-63: answer (int256) — this is the price
          // bytes 64-95: startedAt (uint256)
          // bytes 96-127: updatedAt (uint256)
          // bytes 128-159: answeredInRound (uint80)
          const hex = json.result.slice(2); // remove "0x"
          if (hex.length < 320) {
            console.warn(`[price-sources] Short response for ${feed.symbol}: ${hex.length} chars`);
            return null;
          }

          // answer is at offset 32 bytes (64 hex chars) — int256, can be negative
          const answerHex = hex.slice(64, 128);
          let answerBigInt = BigInt("0x" + answerHex);
          // Handle two's complement for signed int256
          const INT256_MAX = (1n << 255n) - 1n;
          if (answerBigInt > INT256_MAX) {
            answerBigInt = answerBigInt - (1n << 256n);
          }
          // Use BigInt division to avoid floating-point precision loss for large values
          // ORACLE_DECIMALS = 1e8, so we divide by 10^8
          const price = Number(answerBigInt) / ORACLE_DECIMALS;

          // updatedAt is at offset 96 bytes (192 hex chars)
          const updatedAtHex = hex.slice(192, 256);
          const updatedAt = Number(BigInt("0x" + updatedAtHex));

          // Validate: reject stale (>2h), non-positive, or wildly off-peg
          if (price <= 0 || price > 10) {
            console.warn(`[price-sources] Invalid price for ${feed.symbol}: ${price}`);
            return null;
          }
          if (nowSec - updatedAt > STALENESS_THRESHOLD_SEC) {
            console.warn(`[price-sources] Stale feed for ${feed.symbol}: ${nowSec - updatedAt}s old`);
            return null;
          }

          return {
            stablecoinId: feed.stablecoinId,
            symbol: feed.symbol,
            price,
            feedAddress: feed.feedAddress,
            updatedAt,
          } satisfies OracleResult;
        } catch (err) {
          console.warn(`[price-sources] Oracle fetch failed for ${feed.symbol}:`, err);
          return null;
        }
      })
    );

    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  console.log(`[price-sources] Oracle: ${results.length}/${CHAINLINK_FEEDS.length} feeds valid`);
  return results;
}

// ---------------------------------------------------------------------------
// C. CEX prices via CoinGecko tickers
// ---------------------------------------------------------------------------

interface CexResult {
  stablecoinId: string;
  exchangeName: string;
  price: number;
  volume24h: number;
  pair: string;
}

interface CoinGeckoTicker {
  market: { name: string; identifier: string };
  converted_last: { usd: number };
  converted_volume: { usd: number };
  base: string;
  target: string;
  is_anomaly: boolean;
  is_stale: boolean;
}

async function collectCexPrices(): Promise<CexResult[]> {
  const results: CexResult[] = [];

  const entries = Object.entries(GECKO_ID_MAP);
  // Batch in groups of 3 with 2.5s delays to respect CoinGecko free tier (30 calls/min)
  const BATCH_SIZE = 3;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async ([llamaId, geckoId]) => {
        try {
          const res = await fetchWithRetry(
            `https://api.coingecko.com/api/v3/coins/${geckoId}/tickers?order=volume_desc&depth=false`,
            { headers: { Accept: "application/json", "User-Agent": "StableHype/1.0" } },
            1 // only 1 retry for CoinGecko
          );

          if (!res?.ok) return [];

          const data = (await res.json()) as { tickers?: CoinGeckoTicker[] };
          if (!data.tickers) return [];

          // Take top 3 non-anomalous, non-stale tickers by volume
          // Price guard: reject prices <= 0 or > 10 (same as DEX/oracle paths)
          const valid = data.tickers
            .filter((t) => !t.is_anomaly && !t.is_stale && t.converted_last?.usd > 0 && t.converted_last.usd < 10)
            .sort((a, b) => (b.converted_volume?.usd ?? 0) - (a.converted_volume?.usd ?? 0))
            .slice(0, 3);

          return valid.map((t) => ({
            stablecoinId: llamaId,
            exchangeName: t.market.name,
            price: t.converted_last.usd,
            volume24h: t.converted_volume?.usd ?? 0,
            pair: `${t.base}/${t.target}`,
          }));
        } catch (err) {
          console.warn(`[price-sources] CoinGecko failed for ${geckoId}:`, err);
          return [];
        }
      })
    );

    for (const coinResults of batchResults) {
      results.push(...coinResults);
    }

    // Rate limiting: wait 2.5s between batches (except last)
    if (i + BATCH_SIZE < entries.length) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  console.log(`[price-sources] CEX: ${results.length} tickers from ${new Set(results.map((r) => r.exchangeName)).size} exchanges`);
  return results;
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncPriceSources(db: D1Database, rpcUrl: string | null): Promise<void> {
  console.log("[price-sources] Starting multi-source price collection...");
  const startTime = Date.now();

  // Collect from all 3 sources in parallel — wrap each to prevent one failure from aborting all
  const effectiveRpcUrl = rpcUrl || FALLBACK_RPC;
  const [dexSources, oracleSources, cexSources] = await Promise.all([
    collectDexPrices(db).catch((err) => {
      console.error("[price-sources] DEX collection crashed:", err);
      return [] as DexSourceRow[];
    }),
    collectOraclePrices(effectiveRpcUrl).catch((err) => {
      console.error("[price-sources] Oracle collection crashed:", err);
      return [] as OracleResult[];
    }),
    collectCexPrices().catch((err) => {
      console.error("[price-sources] CEX collection crashed:", err);
      return [] as CexResult[];
    }),
  ]);

  // Build D1 statements
  const stmts: D1PreparedStatement[] = [];
  const nowSec = Math.floor(Date.now() / 1000);

  // Compute max TVL per stablecoin for DEX confidence normalization
  const maxDexTvlByCoin = new Map<string, number>();
  for (const src of dexSources) {
    const cur = maxDexTvlByCoin.get(src.stablecoinId) ?? 0;
    if (src.tvl > cur) maxDexTvlByCoin.set(src.stablecoinId, src.tvl);
  }

  // A. DEX sources
  for (const src of dexSources) {
    const maxTvl = Math.max(1, maxDexTvlByCoin.get(src.stablecoinId) ?? 1);
    const confidence = Math.min(1, src.tvl / maxTvl);
    stmts.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO price_sources (stablecoin_id, source_category, source_name, price_usd, confidence, extra_json, updated_at)
           VALUES (?, 'dex', ?, ?, ?, ?, ?)`
        )
        .bind(
          src.stablecoinId,
          src.sourceName,
          src.price,
          confidence,
          JSON.stringify({ chain: src.chain ?? "Ethereum", tvl: src.tvl }),
          nowSec
        )
    );
  }

  // B. Oracle sources
  for (const src of oracleSources) {
    stmts.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO price_sources (stablecoin_id, source_category, source_name, price_usd, confidence, extra_json, updated_at)
           VALUES (?, 'oracle', 'chainlink', ?, 1.0, ?, ?)`
        )
        .bind(
          src.stablecoinId,
          src.price,
          JSON.stringify({ feedAddress: src.feedAddress, symbol: src.symbol, feedUpdatedAt: src.updatedAt }),
          nowSec
        )
    );
  }

  // C. CEX sources
  // Normalize volume for confidence
  const maxCexVolume = Math.max(1, ...cexSources.map((s) => s.volume24h));
  for (const src of cexSources) {
    const confidence = Math.min(1, src.volume24h / maxCexVolume);
    stmts.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO price_sources (stablecoin_id, source_category, source_name, price_usd, confidence, extra_json, updated_at)
           VALUES (?, 'cex', ?, ?, ?, ?, ?)`
        )
        .bind(
          src.stablecoinId,
          src.exchangeName,
          src.price,
          confidence,
          JSON.stringify({ volume24h: src.volume24h, pair: src.pair }),
          nowSec
        )
    );
  }

  // Write in 100-statement chunks (D1 batch limit) — continue on partial failure
  let writtenChunks = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    try {
      await db.batch(stmts.slice(i, i + 100));
      writtenChunks++;
    } catch (err) {
      console.error(`[price-sources] D1 batch chunk ${i / 100 + 1} failed:`, err);
    }
  }

  const totalChunks = Math.ceil(stmts.length / 100);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[price-sources] Done in ${elapsed}s — DEX: ${dexSources.length}, Oracle: ${oracleSources.length}, CEX: ${cexSources.length} → ${stmts.length} rows (${writtenChunks}/${totalChunks} chunks OK)`
  );
}
