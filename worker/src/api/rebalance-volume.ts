/**
 * GET /api/rebalance-volume?days=7&token=0x...&breakdown=type
 *
 * Returns daily rebalance volume aggregates.
 * If `token` param is provided, filters using clear_rebalances table.
 * If `breakdown=type` param is provided, returns per-day internal/external breakdown.
 */
import { classifyRebalanceType, type RebalanceType } from "../lib/clear-address-map";

const emptyTypes = () => ({
  internal: { volumeUSD: 0, rebalanceCount: 0 },
  external: { volumeUSD: 0, rebalanceCount: 0 },
});

export async function handleRebalanceVolume(db: D1Database, url: URL): Promise<Response> {
  try {
    const days = Math.min(Number(url.searchParams.get("days") ?? 90), 365);
    const tokenFilter = url.searchParams.get("token")?.toLowerCase() ?? null;
    const breakdown = url.searchParams.get("breakdown");

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    if (breakdown === "type") {
      // Query grouped by date + tx_from
      let query: string;
      let bindings: string[];

      if (tokenFilter) {
        query = `SELECT date, tx_from, SUM(amount_in_usd) as vol, COUNT(*) as cnt
                 FROM clear_rebalances
                 WHERE date >= ? AND (token_in = ? OR token_out = ?)
                 GROUP BY date, tx_from ORDER BY date ASC`;
        bindings = [cutoff, tokenFilter, tokenFilter];
      } else {
        query = `SELECT date, tx_from, SUM(amount_in_usd) as vol, COUNT(*) as cnt
                 FROM clear_rebalances
                 WHERE date >= ?
                 GROUP BY date, tx_from ORDER BY date ASC`;
        bindings = [cutoff];
      }

      const rows = await db
        .prepare(query)
        .bind(...bindings)
        .all<{ date: string; tx_from: string | null; vol: number; cnt: number }>();

      // Aggregate into Map<date, Record<RebalanceType, { volumeUSD, rebalanceCount }>>
      const dataMap = new Map<string, Record<RebalanceType, { volumeUSD: number; rebalanceCount: number }>>();
      let totalVolume = 0;
      let totalRebalances = 0;

      for (const row of rows.results ?? []) {
        const type = classifyRebalanceType(row.tx_from ?? "");
        if (!dataMap.has(row.date)) {
          dataMap.set(row.date, emptyTypes());
        }
        const entry = dataMap.get(row.date)!;
        entry[type].volumeUSD += row.vol;
        entry[type].rebalanceCount += row.cnt;
        totalVolume += row.vol;
        totalRebalances += row.cnt;
      }

      // Fill all days, including missing ones
      const daily: { date: string; types: Record<RebalanceType, { volumeUSD: number; rebalanceCount: number }> }[] = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const date = d.toISOString().split("T")[0];
        daily.push({
          date,
          types: dataMap.get(date) ?? emptyTypes(),
        });
      }

      return new Response(JSON.stringify({ volumeUSD: totalVolume, rebalanceCount: totalRebalances, daily }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // Default behavior: no breakdown
    const dataMap = new Map<string, { volumeUSD: number; rebalanceCount: number }>();
    let totalVolume = 0;
    let totalRebalances = 0;

    if (tokenFilter) {
      const rows = await db
        .prepare(
          `SELECT date, SUM(amount_in_usd) as vol, COUNT(*) as cnt
           FROM clear_rebalances
           WHERE date >= ? AND (token_in = ? OR token_out = ?)
           GROUP BY date ORDER BY date ASC`
        )
        .bind(cutoff, tokenFilter, tokenFilter)
        .all<{ date: string; vol: number; cnt: number }>();

      for (const row of rows.results ?? []) {
        dataMap.set(row.date, { volumeUSD: row.vol, rebalanceCount: row.cnt });
        totalVolume += row.vol;
        totalRebalances += row.cnt;
      }
    } else {
      const rows = await db
        .prepare("SELECT date, volume_usd, rebalance_count FROM rebalance_volume WHERE date >= ? ORDER BY date ASC")
        .bind(cutoff)
        .all<{ date: string; volume_usd: number; rebalance_count: number }>();

      for (const row of rows.results ?? []) {
        dataMap.set(row.date, { volumeUSD: row.volume_usd, rebalanceCount: row.rebalance_count });
        totalVolume += row.volume_usd;
        totalRebalances += row.rebalance_count;
      }
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
