/**
 * Snapshot Clear vault totalAssets once per day.
 * Used to compute adapter yield (totalAssets growth over time).
 *
 * Runs on the every-5-min cron but only writes one row per UTC day (INSERT OR IGNORE).
 * Uses Etherscan eth_call proxy (no extra RPC dependency).
 */

const CLEAR_VAULT = "0xc4E625Bc9B15F568b2685922fb8e46a7522c4910";
// totalAssets() selector
const TOTAL_ASSETS_SELECTOR = "0x01e1d114";
// decimals() selector
const DECIMALS_SELECTOR = "0x313ce567";
const FALLBACK_RPC = "https://eth.drpc.org";

async function ethCall(to: string, data: string, etherscanKey: string | null): Promise<string | null> {
  // Try Etherscan proxy first, fall back to public RPC
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

  // Fallback: direct RPC
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

export async function syncVaultSnapshot(db: D1Database, etherscanKey: string | null): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Check if we already have a snapshot for today
  const existing = await db
    .prepare("SELECT 1 FROM clear_vault_snapshots WHERE date = ?")
    .bind(today)
    .first();
  if (existing) {
    console.log(`[vault-snapshot] Already have snapshot for ${today}, skipping`);
    return;
  }

  // Fetch totalAssets and decimals
  const [totalAssetsHex, decimalsHex] = await Promise.all([
    ethCall(CLEAR_VAULT, TOTAL_ASSETS_SELECTOR, etherscanKey),
    ethCall(CLEAR_VAULT, DECIMALS_SELECTOR, etherscanKey),
  ]);

  if (!totalAssetsHex) {
    console.warn("[vault-snapshot] Failed to fetch totalAssets");
    return;
  }

  const decimals = decimalsHex ? Number(BigInt(decimalsHex)) : 18;
  const totalAssetsRaw = BigInt(totalAssetsHex);
  const totalAssetsUsd = Number(totalAssetsRaw) / 10 ** decimals;

  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare("INSERT OR IGNORE INTO clear_vault_snapshots (date, total_assets_usd, timestamp) VALUES (?, ?, ?)")
    .bind(today, totalAssetsUsd, now)
    .run();

  console.log(`[vault-snapshot] Saved snapshot for ${today}: $${totalAssetsUsd.toFixed(2)}`);
}
