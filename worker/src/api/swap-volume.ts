export async function handleSwapVolume(db: D1Database, url: URL): Promise<Response> {
  try {
    const days = Math.min(Number(url.searchParams.get("days") ?? 90), 365);

    // Fetch all stored daily volumes (up to `days` back)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    const rows = await db
      .prepare("SELECT date, volume_usd, swap_count FROM swap_volume WHERE date >= ? ORDER BY date ASC")
      .bind(cutoff)
      .all<{ date: string; volume_usd: number; swap_count: number }>();

    // Build full day array (fill missing days with 0)
    const dataMap = new Map<string, { volumeUSD: number; swapCount: number }>();
    let totalVolume = 0;
    let totalSwaps = 0;
    for (const row of rows.results ?? []) {
      dataMap.set(row.date, { volumeUSD: row.volume_usd, swapCount: row.swap_count });
      totalVolume += row.volume_usd;
      totalSwaps += row.swap_count;
    }

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
