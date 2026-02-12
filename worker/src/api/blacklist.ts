export async function handleBlacklist(db: D1Database, url: URL): Promise<Response> {
  try {
    const params = url.searchParams;
    const limit = Math.min(Math.max(parseInt(params.get("limit") ?? "5000", 10) || 5000, 1), 5000);
    const offset = Math.max(parseInt(params.get("offset") ?? "0", 10) || 0, 0);
    const stablecoin = params.get("stablecoin");
    const chain = params.get("chain");
    const eventType = params.get("eventType");

    const conditions: string[] = [];
    const bindings: (string | number)[] = [];

    if (stablecoin) {
      conditions.push("stablecoin = ?");
      bindings.push(stablecoin);
    }
    if (chain) {
      conditions.push("chain_name = ?");
      bindings.push(chain);
    }
    if (eventType) {
      conditions.push("event_type = ?");
      bindings.push(eventType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT * FROM blacklist_events ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    bindings.push(limit, offset);

    const result = await db
      .prepare(sql)
      .bind(...bindings)
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

    return new Response(JSON.stringify(events), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    console.error("[blacklist] D1 query failed:", err);
    return new Response(JSON.stringify([]), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
