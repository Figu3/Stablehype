/**
 * GET /api/clear-tvl-history?days=N
 *
 * Returns daily Clear vault TVL (totalAssets in USD) for the last N days.
 * Used by volume charts to compute V/TVL turnover ratio client-side.
 */

export async function handleClearTvlHistory(
  db: D1Database,
  url: URL,
): Promise<Response> {
  try {
    const daysParam = Number(url.searchParams.get("days") ?? "90");
    const days = Number.isFinite(daysParam)
      ? Math.min(Math.max(Math.trunc(daysParam), 1), 365)
      : 90;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    // One row per day. If multiple snapshots/day, take the latest by rowid.
    const rows = await db
      .prepare(
        `SELECT date, total_assets_usd
         FROM clear_vault_snapshots
         WHERE date >= ?
           AND rowid IN (
             SELECT MAX(rowid) FROM clear_vault_snapshots
             WHERE date >= ?
             GROUP BY date
           )
         ORDER BY date ASC`,
      )
      .bind(cutoff, cutoff)
      .all<{ date: string; total_assets_usd: number }>();

    const daily = (rows.results ?? []).map((r) => ({
      date: r.date,
      totalAssetsUSD: r.total_assets_usd,
    }));

    return new Response(JSON.stringify({ daily }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, max-age=300",
      },
    });
  } catch (err) {
    console.error("[clear-tvl-history] Query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
