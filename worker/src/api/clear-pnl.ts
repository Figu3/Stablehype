/**
 * GET /api/clear-pnl
 *
 * Returns P&L breakdown for Clear Protocol across 1D, 7D, 30D, 90D windows.
 *
 * Swap Fees:    IOU treasury fees + IOU LP fees (1 IOU = $1 at peg)
 * Passive Fees: Adapter yield from vault deposits (pro-rated by period)
 * Total Fees:   Swap Fees + Passive Fees
 * LP Revenue:   LP share of swap fees (goes to liquidity providers)
 * Net Revenue:  Treasury swap fees + Passive fees (stays in protocol)
 */

const IOU_DECIMALS = 18;
const PERIODS = [1, 7, 30, 90];

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

export async function handleClearPnL(db: D1Database): Promise<Response> {
  try {
    // Fetch vault snapshots for yield computation
    const snapshots = await db
      .prepare("SELECT date, total_assets_usd, total_iou_emitted_usd FROM clear_vault_snapshots ORDER BY date ASC")
      .all<{ date: string; total_assets_usd: number; total_iou_emitted_usd: number }>();
    const snapshotRows = snapshots.results ?? [];

    // Initial deposits + deposit date (stored in cache)
    const depositsRow = await db
      .prepare("SELECT value FROM cache WHERE key = 'clear-initial-deposits'")
      .first<{ value: string }>();
    const initialDeposits = depositsRow ? Number(depositsRow.value) : null;

    const depositDateRow = await db
      .prepare("SELECT value FROM cache WHERE key = 'clear-deposit-date'")
      .first<{ value: string }>();
    const depositDate = depositDateRow?.value ?? null;

    // Compute all-time passive fees + daily rate for pro-rating
    let allTimePassive: number | null = null;
    let dailyPassiveRate: number | null = null;

    if (initialDeposits !== null && snapshotRows.length >= 1 && depositDate) {
      const latest = snapshotRows[snapshotRows.length - 1];
      const totalGsm = await db
        .prepare("SELECT SUM(amount_in_usd - amount_out_usd) as total FROM clear_rebalances")
        .first<{ total: number | null }>();

      allTimePassive = latest.total_assets_usd + (latest.total_iou_emitted_usd ?? 0)
        + (totalGsm?.total ?? 0) - initialDeposits;

      const daysSinceDeposit = Math.max(1,
        Math.floor((Date.now() - new Date(depositDate + "T00:00:00Z").getTime()) / 86400000)
      );
      dailyPassiveRate = allTimePassive / daysSinceDeposit;
    }

    const periods: PeriodPnL[] = [];

    for (const days of PERIODS) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoff = cutoffDate.toISOString().split("T")[0];

      // Swap fees: IOU treasury + LP fees
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
      const swapFeesUSD = treasuryFeesUSD + lpFeesUSD;
      const swapCount = feeRow?.swap_count ?? 0;

      // GSM fees for the period (for yield computation only)
      const gsmRow = await db
        .prepare(
          `SELECT SUM(amount_in_usd - amount_out_usd) as gsm_fees, COUNT(*) as rebal_count
           FROM clear_rebalances WHERE date >= ?`
        )
        .bind(cutoff)
        .first<{ gsm_fees: number | null; rebal_count: number }>();

      const rebalanceCount = gsmRow?.rebal_count ?? 0;

      // Passive fees: try snapshot delta first, fall back to pro-rated all-time
      let passiveFeesUSD: number | null = null;

      if (snapshotRows.length >= 2) {
        const latest = snapshotRows[snapshotRows.length - 1];
        let startSnapshot = snapshotRows[0];
        for (const s of snapshotRows) {
          if (s.date <= cutoff) startSnapshot = s;
          else break;
        }
        if (startSnapshot.date !== latest.date) {
          const deltaTotalAssets = latest.total_assets_usd - startSnapshot.total_assets_usd;
          const deltaIou = (latest.total_iou_emitted_usd ?? 0) - (startSnapshot.total_iou_emitted_usd ?? 0);
          const gsmFeesUSD = gsmRow?.gsm_fees ?? 0;
          passiveFeesUSD = deltaTotalAssets + deltaIou + gsmFeesUSD;
        }
      }

      // Fallback: pro-rate all-time yield by period
      if (passiveFeesUSD === null && dailyPassiveRate !== null && depositDate) {
        const daysSinceDeposit = Math.max(1,
          Math.floor((Date.now() - new Date(depositDate + "T00:00:00Z").getTime()) / 86400000)
        );
        const effectiveDays = Math.min(days, daysSinceDeposit);
        passiveFeesUSD = dailyPassiveRate * effectiveDays;
      }

      const totalFeesUSD = swapFeesUSD + (passiveFeesUSD ?? 0);
      const netRevenueUSD = treasuryFeesUSD + (passiveFeesUSD ?? 0);

      periods.push({
        days,
        swapFeesUSD,
        passiveFeesUSD,
        totalFeesUSD,
        lpRevenueUSD: lpFeesUSD,
        netRevenueUSD,
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
