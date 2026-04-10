/**
 * GET /api/clear-pnl
 *
 * Returns P&L breakdown for Clear Protocol across 1D, 7D, 30D, 90D windows.
 *
 * Swap Fees:    IOU treasury fees + IOU LP fees (1 IOU = $1 at peg)
 * Passive Fees: Adapter yield estimated from DeFiLlama supply rates × token balances
 * Total Fees:   Swap Fees + Passive Fees (hero metric)
 * LP Revenue:   LP share of swap fees + all passive fees (accrues to vault LPs)
 * Net Revenue:  Total Fees - LP Revenue (treasury capture)
 */

// IOU fee raw values use the INPUT token's decimals (not a fixed 18)
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const PERIODS = [1, 7, 30, 90];

// GHO refunds received from Aave (reduces GSM fees owed)
// 2026-04-10: 593.7 GHO refund
const GSM_REFUNDS_USD = 593.7;

interface PeriodPnL {
  days: number;
  swapFeesUSD: number;
  passiveFeesUSD: number | null;
  totalFeesUSD: number;
  lpRevenueUSD: number;
  netRevenueUSD: number;
  swapCount: number;
  rebalanceCount: number;
}

interface TokenBalance { address: string; balance: number }
interface AdapterRate { address: string; apyPct: number }

export async function handleClearPnL(db: D1Database): Promise<Response> {
  try {
    // Fetch latest snapshot with token balances and adapter rates
    const latestSnapshot = await db
      .prepare(
        `SELECT total_assets_usd, token_balances_json, adapter_rates_json
         FROM clear_vault_snapshots
         WHERE token_balances_json IS NOT NULL AND adapter_rates_json IS NOT NULL
         ORDER BY date DESC LIMIT 1`
      )
      .first<{ total_assets_usd: number; token_balances_json: string; adapter_rates_json: string }>();

    // Also get the raw latest snapshot for TVL fallback (even without rates)
    const rawLatest = await db
      .prepare("SELECT total_assets_usd FROM clear_vault_snapshots ORDER BY date DESC LIMIT 1")
      .first<{ total_assets_usd: number }>();

    // All-time GSM fees for TVL correction
    const allTimeGsmRow = await db
      .prepare("SELECT SUM(amount_in_usd - amount_out_usd) as total FROM clear_rebalances")
      .first<{ total: number | null }>();
    const allTimeGsmFees = Math.max(0, (allTimeGsmRow?.total ?? 0) - GSM_REFUNDS_USD);

    // Parse adapter rates from latest snapshot (rates change slowly, latest is fine)
    let adapterRates: AdapterRate[] = [];
    if (latestSnapshot) {
      try { adapterRates = JSON.parse(latestSnapshot.adapter_rates_json); } catch { /* ignore */ }
    }

    // Build rate lookup: token address → APY%
    const rateMap = new Map(adapterRates.map((r) => [r.address, r.apyPct]));

    // Fetch all snapshots for TVL-weighted passive fee estimation
    // Uses per-token balances when available, falls back to totalAssets × avg APY
    const allSnapshots = await db
      .prepare(
        `SELECT date, total_assets_usd, token_balances_json FROM clear_vault_snapshots
         ORDER BY date ASC`
      )
      .all<{ date: string; total_assets_usd: number; token_balances_json: string | null }>();

    // Parse snapshots: detailed balances when available, totalAssets as fallback
    interface SnapshotEntry {
      date: string;
      balances: TokenBalance[] | null;
      totalAssetsUsd: number;
    }
    const snapshotEntries: SnapshotEntry[] = [];
    for (const row of allSnapshots.results ?? []) {
      let balances: TokenBalance[] | null = null;
      if (row.token_balances_json) {
        try { balances = JSON.parse(row.token_balances_json); } catch { /* skip */ }
      }
      snapshotEntries.push({ date: row.date, balances, totalAssetsUsd: row.total_assets_usd });
    }

    // Compute weighted average APY from adapter rates (used as fallback for old snapshots)
    let avgApyPct = 0;
    if (adapterRates.length > 0) {
      avgApyPct = adapterRates.reduce((sum, r) => sum + r.apyPct, 0) / adapterRates.length;
    }

    /**
     * Compute passive fees for a period by averaging daily yield across snapshots.
     * For each day, uses the most recent snapshot's balances (carry-forward).
     * Falls back to totalAssets × average APY for old snapshots without per-token data.
     */
    function computePassiveForPeriod(days: number): number | null {
      if (snapshotEntries.length === 0 || adapterRates.length === 0) return null;

      let totalPassive = 0;
      const now = new Date();

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];

        // Find the most recent snapshot on or before this date (carry-forward)
        let best: SnapshotEntry | null = null;
        for (const snap of snapshotEntries) {
          if (snap.date <= dateStr) best = snap;
          else break;
        }

        if (!best) continue;

        if (best.balances) {
          // Detailed: per-token balance × per-token APY
          for (const t of best.balances) {
            const apyPct = rateMap.get(t.address) ?? 0;
            totalPassive += t.balance * (apyPct / 100) / 365;
          }
        } else {
          // Fallback: totalAssets × weighted average APY
          totalPassive += best.totalAssetsUsd * (avgApyPct / 100) / 365;
        }
      }

      return totalPassive;
    }

    const periods: PeriodPnL[] = [];

    for (const days of PERIODS) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoff = cutoffDate.toISOString().split("T")[0];

      // Swap fees: IOU treasury + LP fees (divisor depends on input token decimals)
      const feeRow = await db
        .prepare(
          `SELECT
             SUM(CAST(iou_treasury_fee_raw AS REAL) /
               CASE WHEN token_in IN (?, ?) THEN 1e6 ELSE 1e18 END) as treasury_fees,
             SUM(CAST(iou_lp_fee_raw AS REAL) /
               CASE WHEN token_in IN (?, ?) THEN 1e6 ELSE 1e18 END) as lp_fees,
             COUNT(*) as swap_count
           FROM clear_swaps WHERE date >= ?`
        )
        .bind(USDC, USDT, USDC, USDT, cutoff)
        .first<{ treasury_fees: number | null; lp_fees: number | null; swap_count: number }>();

      const treasuryFeesUSD = feeRow?.treasury_fees ?? 0;
      const lpFeesUSD = feeRow?.lp_fees ?? 0;
      const swapFeesUSD = treasuryFeesUSD + lpFeesUSD;
      const swapCount = feeRow?.swap_count ?? 0;

      const rebalRow = await db
        .prepare("SELECT COUNT(*) as rebal_count FROM clear_rebalances WHERE date >= ?")
        .bind(cutoff)
        .first<{ rebal_count: number }>();
      const rebalanceCount = rebalRow?.rebal_count ?? 0;

      // Passive fees: TVL-weighted average across daily snapshots
      const passiveFeesUSD = computePassiveForPeriod(days);

      const totalFeesUSD = swapFeesUSD + (passiveFeesUSD ?? 0);
      const lpRevenueUSD = lpFeesUSD + (passiveFeesUSD ?? 0);
      const netRevenueUSD = totalFeesUSD - lpRevenueUSD;

      periods.push({
        days,
        swapFeesUSD,
        passiveFeesUSD,
        totalFeesUSD,
        lpRevenueUSD,
        netRevenueUSD,
        swapCount,
        rebalanceCount,
      });
    }

    // TVL fallback: latest totalAssets + GSM fees owed
    const latestTotalAssetsUSD = rawLatest
      ? rawLatest.total_assets_usd + allTimeGsmFees
      : null;

    return new Response(JSON.stringify({ periods, latestTotalAssetsUSD }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, max-age=60",
      },
    });
  } catch (err) {
    console.error("[clear-pnl] Query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
