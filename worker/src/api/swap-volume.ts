/**
 * GET /api/swap-volume?days=7&token=0x...
 *
 * Returns daily swap volume aggregates.
 * If `token` param is provided, filters to swaps involving that token (uses clear_swaps table).
 * Otherwise uses pre-aggregated swap_volume table.
 */
export async function handleSwapVolume(db: D1Database, url: URL): Promise<Response> {
  try {
    const days = Math.min(Number(url.searchParams.get("days") ?? 90), 365);
    const tokenFilter = url.searchParams.get("token")?.toLowerCase() ?? null;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    const dataMap = new Map<string, { volumeUSD: number; swapCount: number }>();
    let totalVolume = 0;
    let totalSwaps = 0;

    if (tokenFilter) {
      // Query per-transaction table with token filter, aggregate by date
      const rows = await db
        .prepare(
          `SELECT date, SUM(amount_in_usd) as vol, COUNT(*) as cnt
           FROM clear_swaps
           WHERE date >= ? AND (token_in = ? OR token_out = ?)
           GROUP BY date ORDER BY date ASC`
        )
        .bind(cutoff, tokenFilter, tokenFilter)
        .all<{ date: string; vol: number; cnt: number }>();

      for (const row of rows.results ?? []) {
        dataMap.set(row.date, { volumeUSD: row.vol, swapCount: row.cnt });
        totalVolume += row.vol;
        totalSwaps += row.cnt;
      }
    } else {
      // Use pre-aggregated table (faster)
      const rows = await db
        .prepare("SELECT date, volume_usd, swap_count FROM swap_volume WHERE date >= ? ORDER BY date ASC")
        .bind(cutoff)
        .all<{ date: string; volume_usd: number; swap_count: number }>();

      for (const row of rows.results ?? []) {
        dataMap.set(row.date, { volumeUSD: row.volume_usd, swapCount: row.swap_count });
        totalVolume += row.volume_usd;
        totalSwaps += row.swap_count;
      }
    }

    // Fill missing days with 0
    const daily: { date: string; volumeUSD: number; swapCount: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split("T")[0];
      const entry = dataMap.get(date);
      daily.push({
        date,
        volumeUSD: entry?.volumeUSD ?? 0,
        swapCount: entry?.swapCount ?? 0,
      });
    }

    return new Response(JSON.stringify({ volumeUSD: totalVolume, swapCount: totalSwaps, daily }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("[swap-volume] D1 query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
