/**
 * Snapshot Clear vault totalAssets + emittedIOU once per day.
 * Used to compute net adapter yield:
 *   yield = delta(totalAssets) - delta(deposits) + delta(emittedIOU)
 *
 * Deposits are tracked via heuristic spike detection (any daily increase
 * above max plausible yield rate is classified as a deposit).
 *
 * Runs on the every-5-min cron but only writes one row per UTC day (INSERT OR IGNORE).
 */

const CLEAR_VAULT = "0xc4E625Bc9B15F568b2685922fb8e46a7522c4910";
// details() selector — returns totalAssets + per-token emittedIou
const DETAILS_SELECTOR = "0x565974d3";
const FALLBACK_RPC = "https://eth.drpc.org";

const TOKEN_DECIMALS: Record<string, number> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,  // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 6,  // USDT
  "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f": 18, // GHO
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": 18, // USDe
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f": 18, // USDS
};

async function ethCall(to: string, data: string, etherscanKey: string | null): Promise<string | null> {
  if (etherscanKey) {
    try {
      const url = `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_call` +
        `&to=${to}&data=${data}&tag=latest&apikey=${etherscanKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (resp.ok) {
        const json = await resp.json() as { result?: string };
        if (json.result && json.result !== "0x") return json.result;
      }
    } catch {
      console.warn("[vault-snapshot] Etherscan eth_call failed, trying fallback RPC");
    }
  }

  try {
    const resp = await fetch(FALLBACK_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to, data }, "latest"],
        id: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) {
      const json = await resp.json() as { result?: string };
      if (json.result && json.result !== "0x") return json.result;
    }
  } catch {
    console.warn("[vault-snapshot] Fallback RPC also failed");
  }

  return null;
}

interface TokenBalance {
  address: string;
  balance: number; // human-readable USD-equivalent amount
}

interface ParsedDetails {
  totalAssetsUsd: number;
  totalIouEmittedUsd: number;
  tokenBalances: TokenBalance[];
}

/**
 * Parse vault.details() response to extract totalAssets, emittedIou, and per-token balances.
 * Layout: word0-3 = config, word4 = totalAssets, word5 = array offset,
 *         word6 = token count, then 10-word tuples per token.
 * Tuple: [addr, iou, iouCurvePool, adapter, maxBps, desiredBps, emittedIou, balance, exposure, decimals]
 */
function parseDetails(hex: string): ParsedDetails | null {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  const word = (i: number) => data.slice(i * 64, (i + 1) * 64);

  try {
    const totalAssetsRaw = BigInt("0x" + word(4));
    const totalAssetsUsd = Number(totalAssetsRaw) / 1e18;

    const tokenCount = Number(BigInt("0x" + word(6)));
    let totalIouEmittedUsd = 0;
    const tokenBalances: TokenBalance[] = [];

    for (let i = 0; i < tokenCount; i++) {
      const base = 7 + i * 10;
      const addr = "0x" + word(base).slice(24).toLowerCase();
      const emittedIouRaw = BigInt("0x" + word(base + 6));
      const balanceRaw = BigInt("0x" + word(base + 7));
      const decimals = TOKEN_DECIMALS[addr] ?? Number(BigInt("0x" + word(base + 9)));
      totalIouEmittedUsd += Number(emittedIouRaw) / 10 ** decimals;
      tokenBalances.push({ address: addr, balance: Number(balanceRaw) / 10 ** decimals });
    }

    return { totalAssetsUsd, totalIouEmittedUsd, tokenBalances };
  } catch {
    return null;
  }
}

// Max plausible daily adapter yield rate (used to detect deposit spikes).
// 20% APR ≈ 0.055% per day — very generous for stablecoin adapters (real: 3-15% APR).
const MAX_DAILY_YIELD_RATE = 0.20 / 365;

// DeFiLlama pool IDs for each vault token's adapter (Aave v3 / Sky sUSDS)
const DEFILLAMA_POOL_IDS: Record<string, string> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "aa70268e-4b52-42bf-a116-608b370f9501", // USDC → Aave v3
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "f981a304-bb6c-45b8-b0c5-fd2f515ad23a", // USDT → Aave v3
  "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f": "ff2a68af-030c-4697-b0a1-b62a738eaef0", // GHO  → Aave v3 sGHO
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": "21e1ac8a-b3aa-4576-9506-0b40137721a0", // USDe → Aave v3
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f": "d8c4eff5-c8a9-46fc-a888-057c4c668e72", // USDS → Sky sUSDS
};

interface AdapterRate {
  address: string;
  apyPct: number;
}

async function fetchAdapterRates(): Promise<AdapterRate[]> {
  try {
    const poolIds = Object.values(DEFILLAMA_POOL_IDS);
    // Fetch individual pool endpoints (lighter than full /pools)
    const results = await Promise.all(
      poolIds.map(async (id) => {
        try {
          const resp = await fetch(`https://yields.llama.fi/chart/${id}`, {
            signal: AbortSignal.timeout(10_000),
            headers: { "User-Agent": "StableHype/1.0" },
          });
          if (!resp.ok) return null;
          const json = await resp.json() as { data?: { apy?: number }[] };
          // Latest data point
          const latest = json.data?.[json.data.length - 1];
          return { poolId: id, apy: latest?.apy ?? 0 };
        } catch {
          return null;
        }
      })
    );

    const rates: AdapterRate[] = [];
    for (const [addr, poolId] of Object.entries(DEFILLAMA_POOL_IDS)) {
      const match = results.find((r) => r?.poolId === poolId);
      rates.push({ address: addr, apyPct: match?.apy ?? 0 });
    }
    return rates;
  } catch {
    console.warn("[vault-snapshot] Failed to fetch DeFiLlama adapter rates");
    return [];
  }
}

export async function syncVaultSnapshot(db: D1Database, etherscanKey: string | null): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const existing = await db
    .prepare("SELECT adapter_rates_json FROM clear_vault_snapshots WHERE date = ?")
    .bind(today)
    .first<{ adapter_rates_json: string | null }>();
  if (existing) {
    // Snapshot exists — but if it's missing adapter rates, backfill them
    if (!existing.adapter_rates_json) {
      const adapterRates = await fetchAdapterRates();
      if (adapterRates.length > 0) {
        await db
          .prepare("UPDATE clear_vault_snapshots SET adapter_rates_json = ? WHERE date = ?")
          .bind(JSON.stringify(adapterRates), today)
          .run();
        console.log(`[vault-snapshot] Backfilled ${today} with ${adapterRates.length} adapter rates`);
      }
    }
    console.log(`[vault-snapshot] Already have snapshot for ${today}, skipping`);
    return;
  }

  const detailsHex = await ethCall(CLEAR_VAULT, DETAILS_SELECTOR, etherscanKey);
  let parsed: ParsedDetails | null = null;
  if (detailsHex) {
    parsed = parseDetails(detailsHex);
  }

  if (!parsed) {
    // vault.details() reverted or returned bad data — still update adapter rates
    // on the existing snapshot so passive yield can be computed
    console.warn("[vault-snapshot] vault.details() unavailable, updating rates only");
    const adapterRates = await fetchAdapterRates();
    if (adapterRates.length > 0) {
      // Update the latest existing snapshot with fresh rates
      await db
        .prepare("UPDATE clear_vault_snapshots SET adapter_rates_json = ? WHERE date = (SELECT MAX(date) FROM clear_vault_snapshots)")
        .bind(JSON.stringify(adapterRates))
        .run();
      console.log(`[vault-snapshot] Updated latest snapshot with ${adapterRates.length} adapter rates`);
    }
    return;
  }

  // Compute cumulative deposits: inherit from previous snapshot + any spike
  const prev = await db
    .prepare(
      "SELECT total_assets_usd, total_deposits_usd FROM clear_vault_snapshots ORDER BY date DESC LIMIT 1"
    )
    .first<{ total_assets_usd: number; total_deposits_usd: number }>();

  let totalDepositsUsd = prev?.total_deposits_usd ?? 0;
  if (prev) {
    const assetsDelta = parsed.totalAssetsUsd - prev.total_assets_usd;
    const maxDailyYieldUsd = prev.total_assets_usd * MAX_DAILY_YIELD_RATE;
    if (assetsDelta > maxDailyYieldUsd) {
      // Large spike = new deposit. Subtract max possible yield to be conservative.
      const depositAmount = assetsDelta - maxDailyYieldUsd;
      totalDepositsUsd += depositAmount;
      console.log(
        `[vault-snapshot] Detected deposit: +$${depositAmount.toFixed(2)} ` +
        `(assets delta $${assetsDelta.toFixed(2)}), cumulative deposits=$${totalDepositsUsd.toFixed(2)}`
      );
    }
  }

  // Fetch adapter yield rates from DeFiLlama
  const adapterRates = await fetchAdapterRates();

  const tokenBalancesJson = JSON.stringify(parsed.tokenBalances);
  const adapterRatesJson = adapterRates.length > 0 ? JSON.stringify(adapterRates) : null;

  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT OR IGNORE INTO clear_vault_snapshots
       (date, total_assets_usd, total_iou_emitted_usd, total_deposits_usd, token_balances_json, adapter_rates_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(today, parsed.totalAssetsUsd, parsed.totalIouEmittedUsd, totalDepositsUsd, tokenBalancesJson, adapterRatesJson, now)
    .run();

  console.log(
    `[vault-snapshot] Saved ${today}: totalAssets=$${parsed.totalAssetsUsd.toFixed(2)}, ` +
    `emittedIOU=$${parsed.totalIouEmittedUsd.toFixed(2)}, deposits=$${totalDepositsUsd.toFixed(2)}, ` +
    `tokens=${parsed.tokenBalances.length}, rates=${adapterRates.length}`
  );
}
