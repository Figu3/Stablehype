/**
 * GET /api/keeper-gas
 *
 * Returns oracle + rebalance keeper gas costs from D1.
 * Both sources stored server-side — no client-side RPC scanning needed.
 *
 * Response:
 * {
 *   oracle:    { totalETH, totalUSD, totalTxs, avgPerTx, daily, weekly, monthly },
 *   rebalance: { totalETH, totalUSD, totalTxs, avgPerTx, daily, weekly, monthly },
 *   combined:  { totalETH, totalUSD, dailyBurnETH, dailyBurnUSD }
 * }
 */

interface CategoryMetrics {
  totalETH: number;
  totalUSD: number;
  totalTxs: number;
  avgPerTx: number;
  daily: number;   // avg USD/day over last 24h
  weekly: number;  // avg USD/day over last 7d
  monthly: number; // avg USD/day over last 30d
}

function emptyMetrics(): CategoryMetrics {
  return { totalETH: 0, totalUSD: 0, totalTxs: 0, avgPerTx: 0, daily: 0, weekly: 0, monthly: 0 };
}

interface GasRow {
  gas_cost_eth: number;
  gas_cost_usd: number;
  timestamp: number;
}

function computeMetrics(rows: GasRow[]): CategoryMetrics {
  if (rows.length === 0) return emptyMetrics();

  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  let totalETH = 0;
  let totalUSD = 0;
  let day1USD = 0;
  let day7USD = 0;
  let day30USD = 0;

  for (const r of rows) {
    totalETH += r.gas_cost_eth;
    totalUSD += r.gas_cost_usd;
    const age = now - r.timestamp;
    if (age <= DAY) day1USD += r.gas_cost_usd;
    if (age <= 7 * DAY) day7USD += r.gas_cost_usd;
    if (age <= 30 * DAY) day30USD += r.gas_cost_usd;
  }

  return {
    totalETH,
    totalUSD,
    totalTxs: rows.length,
    avgPerTx: totalUSD / rows.length,
    daily: day1USD,
    weekly: day7USD / 7,
    monthly: day30USD / 30,
  };
}

export async function handleKeeperGas(db: D1Database, _url: URL): Promise<Response> {
  try {
    // Query all oracle txs with gas data
    const oracleRows = await db
      .prepare(
        `SELECT gas_cost_eth, gas_cost_usd, timestamp
         FROM clear_oracle_txs
         WHERE gas_cost_eth IS NOT NULL
         ORDER BY timestamp ASC`
      )
      .all<GasRow>();

    // Query all rebalance txs with gas data
    const rebalanceRows = await db
      .prepare(
        `SELECT gas_cost_eth, gas_cost_usd, timestamp
         FROM clear_rebalances
         WHERE gas_cost_eth IS NOT NULL
         ORDER BY timestamp ASC`
      )
      .all<GasRow>();

    const oracle = computeMetrics(oracleRows.results ?? []);
    const rebalance = computeMetrics(rebalanceRows.results ?? []);

    const combinedTotalETH = oracle.totalETH + rebalance.totalETH;
    const combinedTotalUSD = oracle.totalUSD + rebalance.totalUSD;

    // Derive current ETH price from most recent oracle tx (avoids extra API call)
    const ethPriceRow = await db
      .prepare(
        `SELECT gas_cost_usd / gas_cost_eth as eth_price
         FROM clear_oracle_txs
         WHERE gas_cost_eth > 0 AND gas_cost_usd > 0
         ORDER BY timestamp DESC LIMIT 1`
      )
      .first<{ eth_price: number }>();
    const ethPriceUsd = ethPriceRow?.eth_price ?? (combinedTotalETH > 0 ? combinedTotalUSD / combinedTotalETH : 0);

    const dailyBurnUSD = oracle.daily + rebalance.daily;
    const dailyBurnETH = ethPriceUsd > 0 ? dailyBurnUSD / ethPriceUsd : 0;

    return new Response(
      JSON.stringify({
        oracle,
        rebalance,
        combined: {
          totalETH: combinedTotalETH,
          totalUSD: combinedTotalUSD,
          dailyBurnETH,
          dailyBurnUSD,
          ethPriceUsd,
        },
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
