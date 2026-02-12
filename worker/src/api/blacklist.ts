export async function handleBlacklist(db: D1Database, url: URL): Promise<Response> {
  try {
    const params = url.searchParams;
    const limit = Math.max(parseInt(params.get("limit") ?? "0", 10) || 0, 0);
    const offset = Math.max(parseInt(params.get("offset") ?? "0", 10) || 0, 0);
    const stablecoin = params.get("stablecoin");
    const chain = params.get("chain");
    const eventType = params.get("eventType");

    const conditions: string[] = [];
    const filterBindings: (string | number)[] = [];

    if (stablecoin) {
      conditions.push("stablecoin = ?");
      filterBindings.push(stablecoin);
    }
    if (chain) {
      conditions.push("chain_name = ?");
      filterBindings.push(chain);
    }
    if (eventType) {
      conditions.push("event_type = ?");
      filterBindings.push(eventType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count for the current filter
    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM blacklist_events ${where}`)
      .bind(...filterBindings)
      .first<{ total: number }>();
    const total = countResult?.total ?? 0;

    // Fetch events — no limit if limit=0 (default), otherwise apply it
    const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
    const offsetClause = offset > 0 ? ` OFFSET ${offset}` : "";
    const sql = `SELECT * FROM blacklist_events ${where} ORDER BY timestamp DESC${limitClause}${offsetClause}`;

    const result = await db
      .prepare(sql)
      .bind(...filterBindings)
      .all<{
        id: string;
        stablecoin: string;
        chain_id: string;
        chain_name: string;
        event_type: string;
        address: string;
        amount: number | null;
        tx_hash: string;
        block_number: number;
        timestamp: number;
        explorer_tx_url: string;
        explorer_address_url: string;
      }>();

    // Map snake_case DB columns to camelCase to match BlacklistEvent interface
    const events = (result.results ?? []).map((row) => ({
      id: row.id,
      stablecoin: row.stablecoin,
      chainId: row.chain_id,
      chainName: row.chain_name,
      eventType: row.event_type,
      address: row.address,
      amount: row.amount,
      txHash: row.tx_hash,
      blockNumber: row.block_number,
      timestamp: row.timestamp,
      explorerTxUrl: row.explorer_tx_url,
      explorerAddressUrl: row.explorer_address_url,
    }));

    return new Response(JSON.stringify({ events, total }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    console.error("[blacklist] D1 query failed:", err);
    return new Response(JSON.stringify({ events: [], total: 0 }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
