/**
 * GET /api/keeper-gas
 *
 * Returns oracle + rebalance keeper gas costs from D1.
 * Both sources stored server-side — no client-side RPC scanning needed.
 *
 * USD totals use the ETH price at tx ingest time (stored in D1), so they are
 * stable across ETH/USD moves. Consumers computing runway should divide the
 * current keeper balance by the ETH-denominated fields (`avgCostETH7d`,
 * `p95CostETH30d`, `txPerHour7d`) to avoid spot-revaluation bias.
 */

interface CategoryMetrics {
  totalETH: number;
  totalUSD: number;
  totalTxs: number;
  avgPerTx: number;   // USD, ingest-priced
  daily: number;      // USD spent in last 24h
  weekly: number;     // avg USD/day over last 7d
  monthly: number;    // avg USD/day over last 30d

  // Runway inputs — ETH-denominated to stay invariant under ETH/USD moves.
  dailyETH: number;
  weeklyETH: number;
  monthlyETH: number;
  txsLast7d: number;
  txsLast30d: number;
  txPerHour7d: number;     // observed cadence, not hardcoded
  avgCostETH7d: number;    // mean per-tx ETH cost over last 7d
  p95CostETH30d: number;   // 95th percentile per-tx ETH cost over last 30d
  maxCostETH30d: number;   // max per-tx ETH cost over last 30d
}

function emptyMetrics(): CategoryMetrics {
  return {
    totalETH: 0, totalUSD: 0, totalTxs: 0, avgPerTx: 0,
    daily: 0, weekly: 0, monthly: 0,
    dailyETH: 0, weeklyETH: 0, monthlyETH: 0,
    txsLast7d: 0, txsLast30d: 0,
    txPerHour7d: 0, avgCostETH7d: 0, p95CostETH30d: 0, maxCostETH30d: 0,
  };
}

interface GasRow {
  gas_cost_eth: number;
  gas_cost_usd: number;
  timestamp: number;
}

export interface DailyBucket {
  date: string;
  total_eth: number;
  total_usd: number;
  count: number;
}

function bucketByDay(rows: GasRow[]): DailyBucket[] {
  const map = new Map<string, DailyBucket>();
  for (const r of rows) {
    const date = new Date(r.timestamp * 1000).toISOString().split("T")[0];
    const b = map.get(date) ?? { date, total_eth: 0, total_usd: 0, count: 0 };
    b.total_eth += r.gas_cost_eth;
    b.total_usd += r.gas_cost_usd;
    b.count += 1;
    map.set(date, b);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx];
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
  let day1ETH = 0;
  let day7ETH = 0;
  let day30ETH = 0;

  const last7dCostsETH: number[] = [];
  const last30dCostsETH: number[] = [];
  let earliest7d = Infinity;
  let latest7d = 0;

  for (const r of rows) {
    totalETH += r.gas_cost_eth;
    totalUSD += r.gas_cost_usd;
    const age = now - r.timestamp;
    if (age <= DAY) {
      day1USD += r.gas_cost_usd;
      day1ETH += r.gas_cost_eth;
    }
    if (age <= 7 * DAY) {
      day7USD += r.gas_cost_usd;
      day7ETH += r.gas_cost_eth;
      last7dCostsETH.push(r.gas_cost_eth);
      if (r.timestamp < earliest7d) earliest7d = r.timestamp;
      if (r.timestamp > latest7d) latest7d = r.timestamp;
    }
    if (age <= 30 * DAY) {
      day30USD += r.gas_cost_usd;
      day30ETH += r.gas_cost_eth;
      last30dCostsETH.push(r.gas_cost_eth);
    }
  }

  // Observed cadence: use actual span of observed txs (prevents division by a
  // full 7d window when we only have, say, 2 days of history).
  const observedSpanHours =
    last7dCostsETH.length >= 2 && latest7d > earliest7d
      ? (latest7d - earliest7d) / 3600
      : 7 * 24;
  const txPerHour7d =
    last7dCostsETH.length > 0 ? last7dCostsETH.length / observedSpanHours : 0;

  const avgCostETH7d =
    last7dCostsETH.length > 0 ? day7ETH / last7dCostsETH.length : 0;

  last30dCostsETH.sort((a, b) => a - b);
  const p95CostETH30d = percentile(last30dCostsETH, 0.95);
  const maxCostETH30d =
    last30dCostsETH.length > 0 ? last30dCostsETH[last30dCostsETH.length - 1] : 0;

  return {
    totalETH,
    totalUSD,
    totalTxs: rows.length,
    avgPerTx: totalUSD / rows.length,
    daily: day1USD,
    weekly: day7USD / 7,
    monthly: day30USD / 30,
    dailyETH: day1ETH,
    weeklyETH: day7ETH / 7,
    monthlyETH: day30ETH / 30,
    txsLast7d: last7dCostsETH.length,
    txsLast30d: last30dCostsETH.length,
    txPerHour7d,
    avgCostETH7d,
    p95CostETH30d,
    maxCostETH30d,
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
    const oracleDaily = bucketByDay(oracleRows.results ?? []);
    const rebalanceDaily = bucketByDay(rebalanceRows.results ?? []);

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

    const dailyBurnETH = oracle.dailyETH + rebalance.dailyETH;
    const dailyBurnUSD = oracle.daily + rebalance.daily;

    return new Response(
      JSON.stringify({
        oracle,
        rebalance,
        oracleDaily,
        rebalanceDaily,
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
          "Cache-Control": "public, max-age=60, stale-while-revalidate=240",
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
