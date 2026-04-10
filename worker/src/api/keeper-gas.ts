/**
 * GET /api/keeper-gas?days=90
 *
 * Returns aggregated keeper gas costs from rebalance transactions stored in D1.
 * Complements the frontend-side oracle gas tracking (use-keeper-gas.ts) by
 * providing server-side rebalance gas data.
 *
 * Response:
 * {
 *   totalGasCostETH, totalGasCostUSD, totalTransactions,
 *   daily: [{ date, gasCostETH, gasCostUSD, transactionCount }],
 *   byType: { internal: {...}, external: {...} }
 * }
 */

import { classifyRebalanceType, type RebalanceType } from "../lib/clear-address-map";

interface DailyGas {
  date: string;
  gasCostETH: number;
  gasCostUSD: number;
  transactionCount: number;
}

interface TypeGas {
  gasCostETH: number;
  gasCostUSD: number;
  transactionCount: number;
}

export async function handleKeeperGas(db: D1Database, url: URL): Promise<Response> {
  try {
    const days = Math.min(Number(url.searchParams.get("days") ?? 90), 365);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    // Query per-transaction rows that have gas data
    const rows = await db
      .prepare(
        `SELECT date, tx_from, gas_cost_eth, gas_cost_usd
         FROM clear_rebalances
         WHERE date >= ? AND gas_cost_eth IS NOT NULL
         ORDER BY date ASC`
      )
      .bind(cutoff)
      .all<{ date: string; tx_from: string | null; gas_cost_eth: number; gas_cost_usd: number }>();

    let totalGasCostETH = 0;
    let totalGasCostUSD = 0;
    let totalTransactions = 0;

    const dailyMap = new Map<string, DailyGas>();
    const typeMap: Record<RebalanceType, TypeGas> = {
      internal: { gasCostETH: 0, gasCostUSD: 0, transactionCount: 0 },
      external: { gasCostETH: 0, gasCostUSD: 0, transactionCount: 0 },
    };

    for (const row of rows.results ?? []) {
      totalGasCostETH += row.gas_cost_eth;
      totalGasCostUSD += row.gas_cost_usd;
      totalTransactions += 1;

      // Daily aggregate
      const entry = dailyMap.get(row.date) ?? { date: row.date, gasCostETH: 0, gasCostUSD: 0, transactionCount: 0 };
      entry.gasCostETH += row.gas_cost_eth;
      entry.gasCostUSD += row.gas_cost_usd;
      entry.transactionCount += 1;
      dailyMap.set(row.date, entry);

      // By type
      const type = classifyRebalanceType(row.tx_from ?? "");
      typeMap[type].gasCostETH += row.gas_cost_eth;
      typeMap[type].gasCostUSD += row.gas_cost_usd;
      typeMap[type].transactionCount += 1;
    }

    // Fill all days including empty ones
    const daily: DailyGas[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split("T")[0];
      daily.push(dailyMap.get(date) ?? { date, gasCostETH: 0, gasCostUSD: 0, transactionCount: 0 });
    }

    // Count rows missing gas data (not yet backfilled)
    const missingRow = await db
      .prepare(
        "SELECT COUNT(*) as cnt FROM clear_rebalances WHERE gas_cost_eth IS NULL"
      )
      .first<{ cnt: number }>();
    const missingGasCount = missingRow?.cnt ?? 0;

    return new Response(
      JSON.stringify({
        totalGasCostETH,
        totalGasCostUSD,
        totalTransactions,
        missingGasCount,
        daily,
        byType: typeMap,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      }
    );
  } catch (err) {
    console.error("[keeper-gas] Query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
