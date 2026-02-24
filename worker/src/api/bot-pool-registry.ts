/**
 * GET /api/bot/pool-registry
 * Returns the pool metadata registry (all known pools with stable pairs).
 *
 * Query params:
 *   stablecoin - filter by stablecoin_id (searches stablecoin_ids_json)
 *   chain      - filter by chain name
 */
export async function handlePoolRegistry(
  db: D1Database,
  url: URL
): Promise<Response> {
  const stablecoin = url.searchParams.get("stablecoin");
  const chain = url.searchParams.get("chain");

  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (stablecoin) {
    // Search within the JSON array — match `"<id>"` within the JSON string
    conditions.push("stablecoin_ids_json LIKE ?");
    binds.push(`%"${stablecoin}"%`);
  }
  if (chain) {
    conditions.push("chain = ?");
    binds.push(chain);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT pool_key, project, chain, pool_symbol, pool_type,
           stablecoin_ids_json, first_seen, last_seen, metadata_json
    FROM pool_registry
    ${where}
    ORDER BY last_seen DESC
    LIMIT 5000
  `;

  const rows = await db
    .prepare(sql)
    .bind(...binds)
    .all();

  const pools = (rows.results ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    stablecoinIds: JSON.parse(row.stablecoin_ids_json as string),
    metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : null,
  }));

  return new Response(
    JSON.stringify({ poolCount: pools.length, pools }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=600, max-age=120",
      },
    }
  );
}
