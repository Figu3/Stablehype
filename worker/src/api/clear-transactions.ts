/**
 * GET /api/clear-transactions
 *
 * Returns per-transaction swap and rebalance data for Clear Protocol.
 *
 * Query params:
 *   type     = "swap" | "rebalance" | "all" (default: "all")
 *   days     = number (default: 30, max: 365)
 *   token    = address (filter by token_in OR token_out)
 *   limit    = number (default: 200, max: 1000)
 *   offset   = number (default: 0)
 */

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

const TOKEN_SYMBOLS: Record<string, string> = {
  [USDC]: "USDC",
  [USDT]: "USDT",
  "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f": "GHO",
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": "USDe",
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f": "USDS",
};

interface SwapRow {
  tx_hash: string;
  block_number: number;
  timestamp: number;
  date: string;
  token_in: string;
  token_out: string;
  receiver: string;
  amount_in_usd: number;
  amount_out_usd: number;
  iou_treasury_fee_raw: string | null;
  iou_lp_fee_raw: string | null;
  treasury_fee_usd: number | null;
  lp_fee_usd: number | null;
}

interface RebalanceRow {
  tx_hash: string;
  block_number: number;
  timestamp: number;
  date: string;
  token_in: string;
  token_out: string;
  amount_in_usd: number;
  amount_out_usd: number;
}

function enrichToken(address: string): { address: string; symbol: string | null } {
  return { address, symbol: TOKEN_SYMBOLS[address] ?? null };
}

export async function handleClearTransactions(db: D1Database, url: URL): Promise<Response> {
  try {
    const type = (url.searchParams.get("type") ?? "all") as "swap" | "rebalance" | "all";
    const days = Math.min(Number(url.searchParams.get("days") ?? 30), 365);
    const tokenFilter = url.searchParams.get("token")?.toLowerCase() ?? null;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    const results: {
      swaps?: unknown[];
      rebalances?: unknown[];
      meta: { days: number; cutoff: string; limit: number; offset: number };
    } = {
      meta: { days, cutoff, limit, offset },
    };

    if (type === "swap" || type === "all") {
      let swapQuery = `SELECT tx_hash, block_number, timestamp, date, token_in, token_out, receiver,
                        amount_in_usd, amount_out_usd, iou_treasury_fee_raw, iou_lp_fee_raw,
                        CAST(iou_treasury_fee_raw AS REAL) /
                          CASE WHEN token_in IN ('${USDC}', '${USDT}') THEN 1e6 ELSE 1e18 END as treasury_fee_usd,
                        CAST(iou_lp_fee_raw AS REAL) /
                          CASE WHEN token_in IN ('${USDC}', '${USDT}') THEN 1e6 ELSE 1e18 END as lp_fee_usd
                        FROM clear_swaps WHERE date >= ?`;
      const swapBinds: (string | number)[] = [cutoff];

      if (tokenFilter) {
        swapQuery += ` AND (token_in = ? OR token_out = ?)`;
        swapBinds.push(tokenFilter, tokenFilter);
      }
      swapQuery += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      swapBinds.push(limit, offset);

      const swapRows = await db
        .prepare(swapQuery)
        .bind(...swapBinds)
        .all<SwapRow>();

      results.swaps = (swapRows.results ?? []).map((r) => ({
        type: "swap" as const,
        txHash: r.tx_hash,
        blockNumber: r.block_number,
        timestamp: r.timestamp,
        date: r.date,
        tokenIn: enrichToken(r.token_in),
        tokenOut: enrichToken(r.token_out),
        receiver: r.receiver,
        amountInUsd: r.amount_in_usd,
        amountOutUsd: r.amount_out_usd,
        fees: {
          treasuryFeeIou: r.iou_treasury_fee_raw,
          lpFeeIou: r.iou_lp_fee_raw,
          treasuryFeeUsd: r.treasury_fee_usd,
          lpFeeUsd: r.lp_fee_usd,
        },
      }));
    }

    if (type === "rebalance" || type === "all") {
      let rebalQuery = `SELECT tx_hash, block_number, timestamp, date, token_in, token_out,
                        amount_in_usd, amount_out_usd
                        FROM clear_rebalances WHERE date >= ?`;
      const rebalBinds: (string | number)[] = [cutoff];

      if (tokenFilter) {
        rebalQuery += ` AND (token_in = ? OR token_out = ?)`;
        rebalBinds.push(tokenFilter, tokenFilter);
      }
      rebalQuery += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      rebalBinds.push(limit, offset);

      const rebalRows = await db
        .prepare(rebalQuery)
        .bind(...rebalBinds)
        .all<RebalanceRow>();

      results.rebalances = (rebalRows.results ?? []).map((r) => ({
        type: "rebalance" as const,
        txHash: r.tx_hash,
        blockNumber: r.block_number,
        timestamp: r.timestamp,
        date: r.date,
        tokenIn: enrichToken(r.token_in),
        tokenOut: enrichToken(r.token_out),
        amountInUsd: r.amount_in_usd,
        amountOutUsd: r.amount_out_usd,
      }));
    }

    return new Response(JSON.stringify(results), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("[clear-transactions] Query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
