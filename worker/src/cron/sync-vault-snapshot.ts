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

/**
 * Parse vault.details() response to extract totalAssets and sum of emittedIou.
 * Layout: word0-3 = config, word4 = totalAssets, word5 = array offset,
 *         word6 = token count, then 10-word tuples per token.
 * Tuple: [addr, iou, iouCurvePool, adapter, maxBps, desiredBps, emittedIou, balance, exposure, decimals]
 */
function parseDetails(hex: string): { totalAssetsUsd: number; totalIouEmittedUsd: number } | null {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  const word = (i: number) => data.slice(i * 64, (i + 1) * 64);

  try {
    const totalAssetsRaw = BigInt("0x" + word(4));
    const totalAssetsUsd = Number(totalAssetsRaw) / 1e18;

    const tokenCount = Number(BigInt("0x" + word(6)));
    let totalIouEmittedUsd = 0;

    for (let i = 0; i < tokenCount; i++) {
      const base = 7 + i * 10;
      const addr = "0x" + word(base).slice(24).toLowerCase();
      const emittedIouRaw = BigInt("0x" + word(base + 6));
      const decimals = TOKEN_DECIMALS[addr] ?? Number(BigInt("0x" + word(base + 9)));
      totalIouEmittedUsd += Number(emittedIouRaw) / 10 ** decimals;
    }

    return { totalAssetsUsd, totalIouEmittedUsd };
  } catch {
    return null;
  }
}

// Max plausible daily adapter yield rate (used to detect deposit spikes).
// 20% APR ≈ 0.055% per day — very generous for stablecoin adapters (real: 3-15% APR).
const MAX_DAILY_YIELD_RATE = 0.20 / 365;

export async function syncVaultSnapshot(db: D1Database, etherscanKey: string | null): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const existing = await db
    .prepare("SELECT 1 FROM clear_vault_snapshots WHERE date = ?")
    .bind(today)
    .first();
  if (existing) {
    console.log(`[vault-snapshot] Already have snapshot for ${today}, skipping`);
    return;
  }

  const detailsHex = await ethCall(CLEAR_VAULT, DETAILS_SELECTOR, etherscanKey);
  if (!detailsHex) {
    console.warn("[vault-snapshot] Failed to fetch vault.details()");
    return;
  }

  const parsed = parseDetails(detailsHex);
  if (!parsed) {
    console.warn("[vault-snapshot] Failed to parse vault.details()");
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

  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT OR IGNORE INTO clear_vault_snapshots
       (date, total_assets_usd, total_iou_emitted_usd, total_deposits_usd, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(today, parsed.totalAssetsUsd, parsed.totalIouEmittedUsd, totalDepositsUsd, now)
    .run();

  console.log(
    `[vault-snapshot] Saved ${today}: totalAssets=$${parsed.totalAssetsUsd.toFixed(2)}, ` +
    `emittedIOU=$${parsed.totalIouEmittedUsd.toFixed(2)}, deposits=$${totalDepositsUsd.toFixed(2)}`
  );
}
