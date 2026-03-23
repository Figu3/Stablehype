export async function handleRebalanceVolume(db: D1Database, url: URL): Promise<Response> {
  try {
    const days = Math.min(Number(url.searchParams.get("days") ?? 90), 365);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    const rows = await db
      .prepare("SELECT date, volume_usd, rebalance_count FROM rebalance_volume WHERE date >= ? ORDER BY date ASC")
      .bind(cutoff)
      .all<{ date: string; volume_usd: number; rebalance_count: number }>();

    const dataMap = new Map<string, { volumeUSD: number; rebalanceCount: number }>();
    let totalVolume = 0;
    let totalRebalances = 0;
    for (const row of rows.results ?? []) {
      dataMap.set(row.date, { volumeUSD: row.volume_usd, rebalanceCount: row.rebalance_count });
      totalVolume += row.volume_usd;
      totalRebalances += row.rebalance_count;
    }

    const daily: { date: string; volumeUSD: number; rebalanceCount: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split("T")[0];
      const entry = dataMap.get(date);
      daily.push({
        date,
        volumeUSD: entry?.volumeUSD ?? 0,
        rebalanceCount: entry?.rebalanceCount ?? 0,
      });
    }

    return new Response(JSON.stringify({ volumeUSD: totalVolume, rebalanceCount: totalRebalances, daily }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("[rebalance-volume] D1 query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
