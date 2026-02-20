export async function handleDepegEvents(db: D1Database, url: URL): Promise<Response> {
  try {
    const params = url.searchParams;
    const limit = Math.max(parseInt(params.get("limit") ?? "0", 10) || 0, 0);
    const offset = Math.max(parseInt(params.get("offset") ?? "0", 10) || 0, 0);
    const stablecoin = params.get("stablecoin");
    const active = params.get("active");

    const conditions: string[] = [];
    const filterBindings: (string | number)[] = [];

    if (stablecoin) {
      conditions.push("stablecoin_id = ?");
      filterBindings.push(stablecoin);
    }
    if (active === "true") {
      conditions.push("ended_at IS NULL");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await db
      .prepare(`SELECT COUNT(id) as total FROM depeg_events ${where}`)
      .bind(...filterBindings)
      .first<{ total: number }>();
    const total = countResult?.total ?? 0;

    // OFFSET requires LIMIT in SQLite — use LIMIT -1 for "no limit"
    const limitClause = limit > 0 ? " LIMIT ?" : offset > 0 ? " LIMIT -1" : "";
    const offsetClause = offset > 0 ? " OFFSET ?" : "";
    const sql = `SELECT id, stablecoin_id, symbol, peg_type, direction, peak_deviation_bps, started_at, ended_at, start_price, peak_price, recovery_price, peg_reference, source FROM depeg_events ${where} ORDER BY started_at DESC${limitClause}${offsetClause}`;
    const paginationBindings: number[] = [];
    if (limit > 0) paginationBindings.push(limit);
    if (offset > 0) paginationBindings.push(offset);

    const result = await db
      .prepare(sql)
      .bind(...filterBindings, ...paginationBindings)
      .all<{
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
      }>();

    const events = (result.results ?? []).map((row) => ({
      id: row.id,
      stablecoinId: row.stablecoin_id,
      symbol: row.symbol,
      pegType: row.peg_type,
      direction: row.direction,
      peakDeviationBps: row.peak_deviation_bps,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      startPrice: row.start_price,
      peakPrice: row.peak_price,
      recoveryPrice: row.recovery_price,
      pegReference: row.peg_reference,
      source: row.source,
    }));

    return new Response(JSON.stringify({ events, total }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, max-age=10",
      },
    });
  } catch (err) {
    console.error("[depeg-events] D1 query failed:", err);
    return new Response(JSON.stringify({ events: [], total: 0 }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
