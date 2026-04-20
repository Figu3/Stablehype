/**
 * GET /api/clear-regime
 *
 * Rolling 7d peg regime + flow direction + vault drift + deposit recommender
 * for Clear Protocol. Used by the RegimeBanner to guide TVL allocation.
 *
 * USDe is excluded (deprecated in protocol). USDS and GHO have floors
 * because of the two-hop route logic in keeper v0.2.5.
 */

const TOKENS = [
  { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
  { symbol: "GHO",  address: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f" },
  { symbol: "USDS", address: "0xdc035d45d973e3ec169d2276ddab16f1e407384f" },
] as const;

const WINDOW_DAYS = 7;
const NEW_TVL_REFERENCE = 150_000;
const USDS_FLOOR_PCT = 0.10;
const GHO_FLOOR_PCT = 0.05;

interface TokenRegime {
  symbol: string;
  address: string;
  aboveCount: number;
  belowCount: number;
  avgAboveBps: number;
  avgBelowBps: number;
  netRegimeBps: number;
  activeDirection: "above" | "below" | null;
}

interface FlowRoute {
  from: string;
  to: string;
  volumeUSD: number;
  swapCount: number;
  spreadUSD: number;
  sharePct: number;
}

interface VaultBalance {
  symbol: string;
  usd: number;
  pct: number;
}

interface SuggestedAllocation {
  symbol: string;
  pct: number;
  usdAtReference: number;
  driftPctPoints: number | null;
  rationale: string;
}

interface ClearRegimeResponse {
  windowDays: number;
  tokens: TokenRegime[];
  flow: {
    totalVolumeUSD: number;
    totalSwaps: number;
    routes: FlowRoute[];
  };
  vault: {
    totalUSD: number;
    balances: VaultBalance[];
  };
  suggested: {
    referenceTVL: number;
    allocations: SuggestedAllocation[];
    narrative: string;
  };
}

function symbolFromAddr(addr: string): string {
  const match = TOKENS.find((t) => t.address.toLowerCase() === addr.toLowerCase());
  return match?.symbol ?? addr.slice(0, 6);
}

export async function handleClearRegime(db: D1Database): Promise<Response> {
  try {
    const cutoffSec = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86_400;
    const cutoffDate = new Date(cutoffSec * 1000).toISOString().split("T")[0];

    // 1) Peg regime from depeg_events (7d window)
    const pegRows = await db
      .prepare(
        `SELECT symbol, direction, peak_deviation_bps, ended_at
         FROM depeg_events
         WHERE symbol IN ('USDC','USDT','GHO','USDS')
           AND started_at >= ?`
      )
      .bind(cutoffSec)
      .all<{ symbol: string; direction: string; peak_deviation_bps: number; ended_at: number | null }>();

    interface PegStat {
      aboveCount: number;
      belowCount: number;
      aboveBpsSum: number;
      belowBpsSum: number;
      activeDirection: "above" | "below" | null;
    }
    const pegStats = new Map<string, PegStat>();
    for (const t of TOKENS) {
      pegStats.set(t.symbol, {
        aboveCount: 0, belowCount: 0, aboveBpsSum: 0, belowBpsSum: 0, activeDirection: null,
      });
    }
    for (const row of pegRows.results ?? []) {
      const stat = pegStats.get(row.symbol);
      if (!stat) continue;
      if (row.direction === "above") {
        stat.aboveCount++;
        stat.aboveBpsSum += row.peak_deviation_bps;
      } else {
        stat.belowCount++;
        stat.belowBpsSum += row.peak_deviation_bps;
      }
      if (row.ended_at === null) {
        stat.activeDirection = row.direction === "above" ? "above" : "below";
      }
    }

    // 2) Flow from clear_swaps (7d window)
    const flowRows = await db
      .prepare(
        `SELECT token_in, token_out,
                COUNT(*) AS n,
                SUM(amount_in_usd) AS vol,
                SUM(amount_in_usd - amount_out_usd) AS spread
         FROM clear_swaps WHERE date >= ?
         GROUP BY token_in, token_out`
      )
      .bind(cutoffDate)
      .all<{ token_in: string; token_out: string; n: number; vol: number | null; spread: number | null }>();

    const rawFlow = flowRows.results ?? [];
    const totalVolume = rawFlow.reduce((a, r) => a + (r.vol ?? 0), 0);
    const totalSwaps = rawFlow.reduce((a, r) => a + (r.n ?? 0), 0);

    const routes: FlowRoute[] = rawFlow
      .map((r) => ({
        from: symbolFromAddr(r.token_in),
        to: symbolFromAddr(r.token_out),
        volumeUSD: r.vol ?? 0,
        swapCount: r.n,
        spreadUSD: r.spread ?? 0,
        sharePct: totalVolume > 0 ? (r.vol ?? 0) / totalVolume : 0,
      }))
      .sort((a, b) => b.volumeUSD - a.volumeUSD);

    // Per-token outflow: demand to RECEIVE this token. Vault needs to hold this.
    const outflowBySymbol = new Map<string, number>(TOKENS.map((t) => [t.symbol, 0]));
    for (const r of routes) {
      if (outflowBySymbol.has(r.to)) {
        outflowBySymbol.set(r.to, (outflowBySymbol.get(r.to) ?? 0) + r.volumeUSD);
      }
    }
    const outflowTotal = Array.from(outflowBySymbol.values()).reduce((a, b) => a + b, 0);

    // 3) Vault composition from latest snapshot
    const snap = await db
      .prepare(
        `SELECT total_assets_usd, token_balances_json
         FROM clear_vault_snapshots
         WHERE token_balances_json IS NOT NULL
         ORDER BY date DESC LIMIT 1`
      )
      .first<{ total_assets_usd: number; token_balances_json: string }>();

    const vaultBalances: VaultBalance[] = [];
    const vaultPctBySymbol = new Map<string, number>();
    let vaultTotalUSD = 0;
    if (snap) {
      vaultTotalUSD = snap.total_assets_usd;
      try {
        const parsed = JSON.parse(snap.token_balances_json) as Array<{ address: string; balance: number }>;
        for (const b of parsed) {
          const sym = symbolFromAddr(b.address);
          const pct = snap.total_assets_usd > 0 ? b.balance / snap.total_assets_usd : 0;
          if (b.balance > 0.01) {
            vaultBalances.push({ symbol: sym, usd: b.balance, pct });
            vaultPctBySymbol.set(sym, pct);
          }
        }
      } catch {
        /* ignore malformed json */
      }
      vaultBalances.sort((a, b) => b.usd - a.usd);
    }

    // 4) Token regime summaries (weighted net bps: +above -below)
    const tokens: TokenRegime[] = TOKENS.map((t) => {
      const s = pegStats.get(t.symbol)!;
      const avgAbove = s.aboveCount > 0 ? s.aboveBpsSum / s.aboveCount : 0;
      const avgBelow = s.belowCount > 0 ? s.belowBpsSum / s.belowCount : 0;
      const totalEvents = s.aboveCount + s.belowCount;
      const netRegime = totalEvents > 0
        ? (avgAbove * s.aboveCount + avgBelow * s.belowCount) / totalEvents
        : 0;
      return {
        symbol: t.symbol,
        address: t.address,
        aboveCount: s.aboveCount,
        belowCount: s.belowCount,
        avgAboveBps: Math.round(avgAbove * 10) / 10,
        avgBelowBps: Math.round(avgBelow * 10) / 10,
        netRegimeBps: Math.round(netRegime * 10) / 10,
        activeDirection: s.activeDirection,
      };
    });

    // 5) Suggested allocation: outflow-share with USDS/GHO floors
    const floors: Record<string, number> = { USDS: USDS_FLOOR_PCT, GHO: GHO_FLOOR_PCT };
    const nonFloored = TOKENS.map((t) => t.symbol).filter((s) => !(s in floors));
    const nonFlooredOutflow = nonFloored.reduce(
      (a, s) => a + (outflowBySymbol.get(s) ?? 0),
      0,
    );
    const remainingBudget = 1 - (floors.USDS + floors.GHO);

    const weightBySymbol = new Map<string, number>();
    for (const sym of Object.keys(floors)) {
      weightBySymbol.set(sym, floors[sym]);
    }
    for (const sym of nonFloored) {
      const share = nonFlooredOutflow > 0
        ? (outflowBySymbol.get(sym) ?? 0) / nonFlooredOutflow
        : 1 / nonFloored.length;
      weightBySymbol.set(sym, share * remainingBudget);
    }

    const allocations: SuggestedAllocation[] = TOKENS.map((t) => {
      const pct = weightBySymbol.get(t.symbol) ?? 0;
      const outflowShare = outflowTotal > 0
        ? (outflowBySymbol.get(t.symbol) ?? 0) / outflowTotal
        : 0;
      const vaultPct = vaultPctBySymbol.get(t.symbol) ?? null;
      const driftPctPoints = vaultPct !== null ? Math.round((vaultPct - pct) * 1000) / 10 : null;
      let rationale: string;
      if (t.symbol === "USDS") {
        rationale = `${Math.round(USDS_FLOOR_PCT * 100)}% floor (keeper reserve)`;
      } else if (t.symbol === "GHO") {
        rationale = `${Math.round(GHO_FLOOR_PCT * 100)}% floor (two-hop unlock, high-margin route)`;
      } else {
        rationale = `${Math.round(outflowShare * 100)}% of 7d outflow`;
      }
      return {
        symbol: t.symbol,
        pct,
        usdAtReference: Math.round(pct * NEW_TVL_REFERENCE),
        driftPctPoints,
        rationale,
      };
    }).sort((a, b) => b.pct - a.pct);

    const topRoute = routes[0];
    const usdtReg = tokens.find((t) => t.symbol === "USDT")?.netRegimeBps ?? 0;
    const usdcReg = tokens.find((t) => t.symbol === "USDC")?.netRegimeBps ?? 0;
    const topAlloc = allocations[0];
    const narrative = topRoute && topAlloc
      ? `7d regime: USDT ${usdtReg >= 0 ? "+" : ""}${usdtReg.toFixed(1)} bps, USDC ${usdcReg >= 0 ? "+" : ""}${usdcReg.toFixed(1)} bps. Dominant route ${topRoute.from}→${topRoute.to} (${Math.round(topRoute.sharePct * 100)}% of volume). Tilt new deposits toward ${topAlloc.symbol}.`
      : "Insufficient flow data in 7d window.";

    const payload: ClearRegimeResponse = {
      windowDays: WINDOW_DAYS,
      tokens,
      flow: { totalVolumeUSD: totalVolume, totalSwaps, routes },
      vault: { totalUSD: vaultTotalUSD, balances: vaultBalances },
      suggested: { referenceTVL: NEW_TVL_REFERENCE, allocations, narrative },
    };

    return new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, max-age=60",
      },
    });
  } catch (err) {
    console.error("[clear-regime] Query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
