/**
 * GET /api/clear-fees
 *
 * Returns volume-weighted average fee bps earned by Clear Protocol per swap,
 * across 1D, 7D, 14D, 30D, 90D windows.
 *
 * Components per window:
 *   treasuryBps = SUM(iou_treasury_fee_usd) / SUM(amount_in_usd) * 10000
 *   lpBps       = SUM(iou_lp_fee_usd)       / SUM(amount_in_usd) * 10000
 *   spreadBps   = SUM(max(0, amount_in_usd - amount_out_usd - iou_fees)) / SUM(amount_in_usd) * 10000
 *   totalBps    = treasuryBps + lpBps + spreadBps
 *
 * Reconstruction matches /api/clear-pnl's spread definition (no oracle required).
 */

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const WINDOWS = [1, 7, 14, 30, 90];

interface FeeWindow {
  days: number;
  volumeUSD: number;
  swapCount: number;
  treasuryFeeUSD: number;
  lpFeeUSD: number;
  spreadFeeUSD: number;
  totalFeeUSD: number;
  treasuryBps: number;
  lpBps: number;
  spreadBps: number;
  totalBps: number;
}

export async function handleClearFees(db: D1Database): Promise<Response> {
  try {
    const windows: FeeWindow[] = [];
    const nowSec = Math.floor(Date.now() / 1000);

    for (const days of WINDOWS) {
      const cutoffSec = nowSec - days * 86400;

      // Single query: volume, IOU fees (decimals depend on token_in), and spread.
      const row = await db
        .prepare(
          `SELECT
             COALESCE(SUM(amount_in_usd), 0) as volume_usd,
             COUNT(*) as swap_count,
             COALESCE(SUM(CAST(iou_treasury_fee_raw AS REAL) /
               CASE WHEN token_in IN (?, ?) THEN 1e6 ELSE 1e18 END), 0) as treasury_fee_usd,
             COALESCE(SUM(CAST(iou_lp_fee_raw AS REAL) /
               CASE WHEN token_in IN (?, ?) THEN 1e6 ELSE 1e18 END), 0) as lp_fee_usd,
             COALESCE(SUM(amount_in_usd - amount_out_usd), 0) as gross_spread_usd
           FROM clear_swaps
           WHERE timestamp >= ?`
        )
        .bind(USDC, USDT, USDC, USDT, cutoffSec)
        .first<{
          volume_usd: number;
          swap_count: number;
          treasury_fee_usd: number;
          lp_fee_usd: number;
          gross_spread_usd: number;
        }>();

      const volumeUSD = row?.volume_usd ?? 0;
      const swapCount = row?.swap_count ?? 0;
      const treasuryFeeUSD = row?.treasury_fee_usd ?? 0;
      const lpFeeUSD = row?.lp_fee_usd ?? 0;
      const grossSpreadUSD = row?.gross_spread_usd ?? 0;
      const iouFeesUSD = treasuryFeeUSD + lpFeeUSD;
      const spreadFeeUSD = Math.max(0, grossSpreadUSD - iouFeesUSD);
      const totalFeeUSD = iouFeesUSD + spreadFeeUSD;

      const bps = (n: number) => (volumeUSD > 0 ? (n / volumeUSD) * 10000 : 0);

      windows.push({
        days,
        volumeUSD,
        swapCount,
        treasuryFeeUSD,
        lpFeeUSD,
        spreadFeeUSD,
        totalFeeUSD,
        treasuryBps: bps(treasuryFeeUSD),
        lpBps: bps(lpFeeUSD),
        spreadBps: bps(spreadFeeUSD),
        totalBps: bps(totalFeeUSD),
      });
    }

    return new Response(JSON.stringify({ windows }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, max-age=60",
      },
    });
  } catch (err) {
    console.error("[clear-fees] Query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
