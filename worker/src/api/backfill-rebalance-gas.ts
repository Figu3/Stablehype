/**
 * GET /api/backfill-rebalance-gas?limit=50 (admin, API-key protected)
 *
 * Backfills gas data for existing clear_rebalances rows that have gas_cost_eth IS NULL.
 * Fetches receipts from Etherscan and current ETH price, then updates in batch.
 * Call repeatedly until missingCount reaches 0.
 */

export async function handleBackfillRebalanceGas(
  db: D1Database,
  etherscanKey: string | null,
  url: URL
): Promise<Response> {
  if (!etherscanKey) {
    return new Response(JSON.stringify({ error: "No ETHERSCAN_API_KEY configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  // Find rows missing gas data
  const rows = await db
    .prepare(
      "SELECT id, tx_hash FROM clear_rebalances WHERE gas_cost_eth IS NULL ORDER BY id ASC LIMIT ?"
    )
    .bind(limit)
    .all<{ id: number; tx_hash: string }>();

  const missing = rows.results ?? [];
  if (missing.length === 0) {
    return new Response(JSON.stringify({ updated: 0, remaining: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch ETH price once
  let ethPrice: number | null = null;
  try {
    const priceResp = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=stats&action=ethprice&apikey=${etherscanKey}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (priceResp.ok) {
      const priceJson = (await priceResp.json()) as { result?: { ethusd?: string } };
      ethPrice = parseFloat(priceJson.result?.ethusd ?? "");
      if (isNaN(ethPrice)) ethPrice = null;
    }
  } catch { /* ignore */ }

  // Deduplicate tx hashes (multiple rebalance events can share a tx)
  const hashToIds = new Map<string, number[]>();
  for (const row of missing) {
    const ids = hashToIds.get(row.tx_hash) ?? [];
    ids.push(row.id);
    hashToIds.set(row.tx_hash, ids);
  }

  // Fetch receipts
  const stmts: D1PreparedStatement[] = [];
  let updated = 0;

  for (const [txHash, ids] of hashToIds) {
    try {
      const resp = await fetch(
        `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionReceipt` +
          `&txhash=${txHash}&apikey=${etherscanKey}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!resp.ok) continue;

      const json = (await resp.json()) as {
        result?: { gasUsed?: string; effectiveGasPrice?: string };
      };
      const r = json.result;
      if (!r?.gasUsed || !r?.effectiveGasPrice) continue;

      const gasUsed = parseInt(r.gasUsed, 16);
      const effectiveGasPriceWei = parseInt(r.effectiveGasPrice, 16);
      const gasPriceGwei = effectiveGasPriceWei / 1e9;
      const gasCostEth = (gasUsed * effectiveGasPriceWei) / 1e18;
      const gasCostUsd = ethPrice !== null ? gasCostEth * ethPrice : null;

      for (const id of ids) {
        stmts.push(
          db.prepare(
            `UPDATE clear_rebalances
             SET gas_used = ?, gas_price_gwei = ?, gas_cost_eth = ?, gas_cost_usd = ?
             WHERE id = ?`
          ).bind(gasUsed, gasPriceGwei, gasCostEth, gasCostUsd, id)
        );
        updated++;
      }
    } catch {
      console.warn(`[backfill-rebalance-gas] Failed receipt for ${txHash}`);
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  // Count remaining
  const remainingRow = await db
    .prepare("SELECT COUNT(*) as cnt FROM clear_rebalances WHERE gas_cost_eth IS NULL")
    .first<{ cnt: number }>();

  return new Response(
    JSON.stringify({
      updated,
      remaining: remainingRow?.cnt ?? 0,
      ethPrice,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
