/**
 * GET /api/clear-pnl
 *
 * Returns P&L breakdown for Clear Protocol across 1D, 7D, 30D, 90D windows.
 *
 * Swap Fees:    IOU treasury fees + IOU LP fees (1 IOU = $1 at peg)
 * Passive Fees: Net adapter yield = delta(totalAssets) - delta(deposits) + delta(emittedIOU)
 * Total Fees:   Swap Fees + Passive Fees (hero metric)
 * LP Revenue:   LP share of swap fees + all passive fees (accrues to vault LPs)
 * Net Revenue:  Total Fees - LP Revenue (treasury capture)
 */

// IOU fee raw values use the INPUT token's decimals (not a fixed 18)
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
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
    // Fetch vault snapshots for yield computation (includes cumulative deposits)
    const snapshots = await db
      .prepare("SELECT date, total_assets_usd, total_iou_emitted_usd, total_deposits_usd FROM clear_vault_snapshots ORDER BY date ASC")
      .all<{ date: string; total_assets_usd: number; total_iou_emitted_usd: number; total_deposits_usd: number }>();
    const snapshotRows = snapshots.results ?? [];

    const depositDateRow = await db
      .prepare("SELECT value FROM cache WHERE key = 'clear-deposit-date'")
      .first<{ value: string }>();
    const depositDate = depositDateRow?.value ?? null;

    // Compute all-time passive fees + daily rate for pro-rating
    let allTimePassive: number | null = null;
    let dailyPassiveRate: number | null = null;

    if (snapshotRows.length >= 1) {
      const latest = snapshotRows[snapshotRows.length - 1];
      const totalDeposits = latest.total_deposits_usd ?? 0;

      if (totalDeposits > 0) {
        allTimePassive = latest.total_assets_usd + (latest.total_iou_emitted_usd ?? 0)
          - totalDeposits;

        const daysSinceDeposit = depositDate ? Math.max(1,
          Math.floor((Date.now() - new Date(depositDate + "T00:00:00Z").getTime()) / 86400000)
        ) : 1;
        dailyPassiveRate = allTimePassive / daysSinceDeposit;
      }
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

      // Passive fees: use snapshot delta if span covers the full period,
      // otherwise pro-rate from all-time daily rate
      let passiveFeesUSD: number | null = null;

      if (snapshotRows.length >= 2) {
        const latest = snapshotRows[snapshotRows.length - 1];
        let startSnapshot = snapshotRows[0];
        for (const s of snapshotRows) {
          if (s.date <= cutoff) startSnapshot = s;
          else break;
        }
        if (startSnapshot.date !== latest.date) {
          const spanMs = new Date(latest.date + "T00:00:00Z").getTime()
            - new Date(startSnapshot.date + "T00:00:00Z").getTime();
          const spanDays = Math.max(1, Math.round(spanMs / 86400000));

          if (spanDays >= days) {
            // Snapshot span fully covers the requested period — use exact delta
            // Subtract deposit delta so new deposits don't inflate yield
            const deltaTotalAssets = latest.total_assets_usd - startSnapshot.total_assets_usd;
            const deltaDeposits = (latest.total_deposits_usd ?? 0) - (startSnapshot.total_deposits_usd ?? 0);
            const deltaIou = (latest.total_iou_emitted_usd ?? 0) - (startSnapshot.total_iou_emitted_usd ?? 0);
            passiveFeesUSD = deltaTotalAssets - deltaDeposits + deltaIou;
          }
        }
      }

      // If snapshot span is too short, pro-rate from all-time daily rate
      // Cap at actual vault age (don't extrapolate beyond vault lifetime)
      if (passiveFeesUSD === null && dailyPassiveRate !== null && depositDate) {
        const daysSinceDeposit = Math.max(1,
          Math.floor((Date.now() - new Date(depositDate + "T00:00:00Z").getTime()) / 86400000)
        );
        const effectiveDays = Math.min(days, daysSinceDeposit);
        passiveFeesUSD = dailyPassiveRate * effectiveDays;
      }

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

    return new Response(JSON.stringify({ periods }), {
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
