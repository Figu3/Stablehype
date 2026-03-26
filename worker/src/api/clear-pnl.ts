/**
 * GET /api/clear-pnl
 *
 * Returns P&L breakdown for Clear Protocol across 1D, 7D, 30D, 90D windows.
 *
 * Revenue: IOU treasury fees + IOU LP fees from swaps (1 IOU = $1 at peg)
 *          + GSM reimbursement (Aave reimburses GSM fees monthly, so it's a receivable)
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
    const periods: PeriodPnL[] = [];

    for (const days of PERIODS) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoff = cutoffDate.toISOString().split("T")[0];

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
      const revenueUSD = treasuryFeesUSD + lpFeesUSD;
      const swapCount = feeRow?.swap_count ?? 0;

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

      // GSM fees are fully reimbursed by Aave monthly — count as receivable revenue
      const gsmReimbursementUSD = gsmFeesUSD;
      const totalRevenueUSD = revenueUSD + gsmReimbursementUSD;

      periods.push({
        days,
        revenue: { treasuryFeesUSD, lpFeesUSD, gsmReimbursementUSD, totalUSD: totalRevenueUSD },
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
