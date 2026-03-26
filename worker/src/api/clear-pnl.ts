/**
 * GET /api/clear-pnl
 *
 * Returns P&L breakdown for Clear Protocol across 1D, 7D, 30D, 90D windows.
 *
 * Revenue: IOU treasury fees + IOU LP fees from swaps (1 IOU = $1 at peg)
 *          + GSM reimbursement (Aave reimburses GSM fees monthly)
 *          + Adapter yield (totalAssets growth from daily vault snapshots)
 * Costs:   GSM fees (rebalance slippage: amountIn - amountOut)
 *
 * Keeper gas is excluded (fetched client-side via RPC).
 * TVL is excluded (fetched client-side via RPC) — APR computed in frontend.
 */

const IOU_DECIMALS = 18;
const PERIODS = [1, 7, 30, 90];

interface PeriodPnL {
  days: number;
  revenue: {
    treasuryFeesUSD: number;
    lpFeesUSD: number;
    gsmReimbursementUSD: number;
    adapterYieldUSD: number | null; // null if not enough snapshot data
    totalUSD: number;
  };
  costs: {
    gsmFeesUSD: number;
    totalUSD: number;
  };
  netPnlUSD: number;
  swapCount: number;
  rebalanceCount: number;
}

export async function handleClearPnL(db: D1Database): Promise<Response> {
  try {
    // Fetch all vault snapshots (ordered by date) for yield computation
    const snapshots = await db
      .prepare("SELECT date, total_assets_usd FROM clear_vault_snapshots ORDER BY date ASC")
      .all<{ date: string; total_assets_usd: number }>();
    const snapshotRows = snapshots.results ?? [];

    const periods: PeriodPnL[] = [];

    for (const days of PERIODS) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoff = cutoffDate.toISOString().split("T")[0];

      // Revenue: IOU fees from swaps
      const feeRow = await db
        .prepare(
          `SELECT
             SUM(CAST(iou_treasury_fee_raw AS REAL) / 1e${IOU_DECIMALS}) as treasury_fees,
             SUM(CAST(iou_lp_fee_raw AS REAL) / 1e${IOU_DECIMALS}) as lp_fees,
             COUNT(*) as swap_count
           FROM clear_swaps WHERE date >= ?`
        )
        .bind(cutoff)
        .first<{ treasury_fees: number | null; lp_fees: number | null; swap_count: number }>();

      const treasuryFeesUSD = feeRow?.treasury_fees ?? 0;
      const lpFeesUSD = feeRow?.lp_fees ?? 0;
      const swapFeeRevenueUSD = treasuryFeesUSD + lpFeesUSD;
      const swapCount = feeRow?.swap_count ?? 0;

      // Costs: GSM fees
      const gsmRow = await db
        .prepare(
          `SELECT
             SUM(amount_in_usd - amount_out_usd) as gsm_fees,
             COUNT(*) as rebal_count
           FROM clear_rebalances WHERE date >= ?`
        )
        .bind(cutoff)
        .first<{ gsm_fees: number | null; rebal_count: number }>();

      const gsmFeesUSD = gsmRow?.gsm_fees ?? 0;
      const rebalanceCount = gsmRow?.rebal_count ?? 0;

      // GSM fees are fully reimbursed by Aave monthly
      const gsmReimbursementUSD = gsmFeesUSD;

      // Adapter yield: totalAssets delta over the period
      // We need a snapshot at/before the cutoff and the latest snapshot
      let adapterYieldUSD: number | null = null;
      if (snapshotRows.length >= 2) {
        const latest = snapshotRows[snapshotRows.length - 1];
        // Find the closest snapshot to the cutoff date (at or before)
        let startSnapshot = snapshotRows[0];
        for (const s of snapshotRows) {
          if (s.date <= cutoff) startSnapshot = s;
          else break;
        }
        // Only compute if start snapshot is at or before cutoff and different from latest
        if (startSnapshot.date !== latest.date) {
          adapterYieldUSD = latest.total_assets_usd - startSnapshot.total_assets_usd;
        }
      }

      const totalRevenueUSD = swapFeeRevenueUSD + gsmReimbursementUSD + (adapterYieldUSD ?? 0);

      periods.push({
        days,
        revenue: {
          treasuryFeesUSD,
          lpFeesUSD,
          gsmReimbursementUSD,
          adapterYieldUSD,
          totalUSD: totalRevenueUSD,
        },
        costs: { gsmFeesUSD, totalUSD: gsmFeesUSD },
        netPnlUSD: totalRevenueUSD - gsmFeesUSD,
        swapCount,
        rebalanceCount,
      });
    }

    return new Response(JSON.stringify({ periods }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
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
