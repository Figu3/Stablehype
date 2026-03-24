/**
 * GET /api/backfill-tx-details
 * One-time admin endpoint: fills tx_from/tx_to for existing clear_swaps + clear_rebalances rows.
 * Requires X-Api-Key header (uses authed() wrapper — same ADMIN_KEY secret).
 */
export async function handleBackfillTxDetails(
  db: D1Database,
  etherscanKey: string | null
): Promise<Response> {
  if (!etherscanKey) {
    return new Response(JSON.stringify({ error: "No ETHERSCAN_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Collect tx hashes with missing tx_from
  const swapRows = await db
    .prepare("SELECT DISTINCT tx_hash FROM clear_swaps WHERE tx_from IS NULL")
    .all<{ tx_hash: string }>();
  const rebalRows = await db
    .prepare("SELECT DISTINCT tx_hash FROM clear_rebalances WHERE tx_from IS NULL")
    .all<{ tx_hash: string }>();

  const allHashes = [
    ...new Set([
      ...(swapRows.results ?? []).map((r) => r.tx_hash),
      ...(rebalRows.results ?? []).map((r) => r.tx_hash),
    ]),
  ];

  if (allHashes.length === 0) {
    return new Response(JSON.stringify({ message: "Nothing to backfill", updated: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch tx details
  const details = new Map<string, { from: string; to: string }>();
  for (const hash of allHashes) {
    try {
      const url =
        `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionByHash` +
        `&txhash=${hash}&apikey=${etherscanKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) continue;
      const json = (await resp.json()) as { result?: { from?: string; to?: string } };
      if (json.result?.from) {
        details.set(hash, {
          from: (json.result.from ?? "").toLowerCase(),
          to: (json.result.to ?? "").toLowerCase(),
        });
      }
    } catch {
      // skip
    }
  }

  // Batch update
  const stmts: D1PreparedStatement[] = [];
  for (const [hash, { from, to }] of details) {
    stmts.push(
      db.prepare("UPDATE clear_swaps SET tx_from = ?, tx_to = ? WHERE tx_hash = ? AND tx_from IS NULL")
        .bind(from, to, hash)
    );
    stmts.push(
      db.prepare("UPDATE clear_rebalances SET tx_from = ?, tx_to = ? WHERE tx_hash = ? AND tx_from IS NULL")
        .bind(from, to, hash)
    );
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return new Response(
    JSON.stringify({
      message: "Backfill complete",
      hashesFound: allHashes.length,
      detailsFetched: details.size,
      statementsRun: stmts.length,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
