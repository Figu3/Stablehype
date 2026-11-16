import { getCache, getLastBlock } from "../lib/db";
import { computeBurnPerHour, computeLpApr, computeNavApr, computeRevenue, computeRunway, computeTvl, computeVolume, percentile, type BlpPrices, type MetricEvent } from "../lib/clear-v1-metrics";
import { STATE_CACHE_KEY, type V1State } from "../cron/sync-clear-v1-state";
import { loadRegistry } from "../lib/clear-v1-registry";
import { SEVE_SAFES, V1_GAS_WATCHLIST } from "@shared/lib/clear-v1-config";

const PERIODS = [1, 7, 30, 90];
const APR_DAYS = 7;
const EVENTS_CURSOR = "clear-v1-events";
const EVENTS_CRON_JOB = "sync-clear-v1-events";
// Mirrors the ClearV1Kind union in lib/clear-v1-decode.ts.
const KNOWN_KINDS = new Set([
  "swap", "rebalance", "flash_loan", "deposit", "withdraw",
  "iou_mint", "iou_redeem", "pool_swap", "pool_liquidity", "admin",
]);
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, max-age=60" },
  });
const fail = (where: string, err: unknown) => {
  console.error(`[${where}] failed:`, err);
  return new Response(JSON.stringify({ error: "Internal server error" }), {
    status: 500, headers: { "Content-Type": "application/json" },
  });
};
const newestEventTimestamp = async (db: D1Database): Promise<number | null> => {
  const row = await db.prepare("SELECT MAX(timestamp) t FROM clear_v1_events").first<{ t: number | null }>();
  return row?.t ?? null;
};
const eventsSyncedAt = async (db: D1Database): Promise<number | null> => {
  try {
    const row = await db.prepare("SELECT last_success FROM cron_health WHERE job_name = ?")
      .bind(EVENTS_CRON_JOB).first<{ last_success: number | null }>();
    return row?.last_success ?? null;
  } catch {
    return null; // cron_health may not exist yet
  }
};
// First date of an N-day window ending today: 1 means today only.
const sinceDate = (days: number) => new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

export async function handleClearV1Overview(db: D1Database): Promise<Response> {
  try {
    const cached = await getCache(db, STATE_CACHE_KEY);
    const state = cached ? (JSON.parse(cached.value) as V1State) : null;
    const { discovered, registry: reg } = await loadRegistry(db);

    const [priceRows, eventRows, tvlRows] = await Promise.all([
      db.prepare("SELECT date, blp_redemption_price p FROM clear_v1_snapshots WHERE blp_redemption_price IS NOT NULL")
        .all<{ date: string; p: number }>(),
      db.prepare(
        `SELECT tx_hash, date, contract, kind, actor, tx_from, tx_to, token_in, token_out, amount_in_raw, amount_out_raw,
                volume_token, volume_units, fee_token, fee_treasury_units, fee_lp_units, fee_trader_units
         FROM clear_v1_events
         WHERE kind IN ('swap','rebalance','flash_loan','deposit','withdraw','pool_swap')`
        // Every event, for the all-time totals. Tens of rows a day today: move the all-time sums
        // into SQL before this grows past what a request should load.
      ).all<MetricEvent & { tx_to: string | null; actor: string | null; tx_from: string | null }>(),
      db.prepare("SELECT date, contract, gross_par, net_par, iou_debt_par, state_json FROM clear_v1_snapshots ORDER BY date")
        .all<{ date: string; contract: string; gross_par: number | null; net_par: number | null; iou_debt_par: number | null; state_json: string }>(),
    ]);

    const prices: BlpPrices = new Map(priceRows.results.map((r) => [r.date, r.p]));
    const events = eventRows.results;

    const rebalanceVolume = (rows: typeof events) =>
      computeVolume(rows.filter((e) => e.kind === "rebalance"), prices).reserveLegVolume;
    const firstDate = events.reduce<string | null>((a, e) => (a === null || e.date < a ? e.date : a), null);
    // `before` is the window ahead of this one, or null when history does not cover it whole.
    const summarise = (days: number, inWindow: typeof events, before: typeof events | null) => {
      const swaps = inWindow.filter((e) => e.kind === "swap");
      return {
        days,
        ...computeVolume(swaps, prices),
        poolVolume: computeVolume(inWindow.filter((e) => e.kind === "pool_swap"), prices).reserveLegVolume,
        swapCount: new Set(swaps.map((s) => s.tx_hash)).size,
        rebalanceCount: inWindow.filter((e) => e.kind === "rebalance").length,
        rebalanceVolume: rebalanceVolume(inWindow),
        revenue: computeRevenue(inWindow, prices),
        previous: before
          ? {
              swapVolume: computeVolume(before.filter((e) => e.kind === "swap"), prices).swapVolume,
              revenue: computeRevenue(before, prices).total,
              rebalanceVolume: rebalanceVolume(before),
            }
          : null,
      };
    };
    const periods = PERIODS.map((days) => {
      const since = sinceDate(days);
      const prevSince = sinceDate(days * 2);
      // A partial window is never compared as if it were whole.
      const covered = firstDate !== null && firstDate <= prevSince;
      return summarise(
        days,
        events.filter((e) => e.date >= since),
        covered ? events.filter((e) => e.date >= prevSince && e.date < since) : null,
      );
    });
    // Everything indexed. `days` is the calendar span since the first event.
    const allTime = summarise(
      firstDate === null ? 0 : Math.round((Date.parse(sinceDate(1)) - Date.parse(firstDate)) / 86_400_000) + 1,
      events, null,
    );

    const last7 = events.filter((e) => e.date >= sinceDate(7));
    const swaps7 = last7.filter((e) => e.kind === "swap");
    const pools7 = last7.filter((e) => e.kind === "pool_swap");

    const reserveVolume7d = reg.reserves.map((r) => ({
      address: r.address,
      volume: computeVolume(swaps7.filter((e) => e.contract === r.address), prices).reserveLegVolume,
    }));
    // LP fees a reserve earned on its own swaps and flash loans, against its average net value
    // over the days of the window that have a snapshot. Fees on days without one are left out,
    // so numerator and denominator cover the same days.
    const reserveLpApr7d = reg.reserves.map((r) => {
      const snaps = tvlRows.results.filter((s) => s.contract === r.address && s.date >= sinceDate(APR_DAYS) && s.net_par !== null);
      const dates = new Set(snaps.map((s) => s.date));
      const rev = computeRevenue(events.filter((e) => e.contract === r.address && dates.has(e.date)), prices);
      const lpFees = rev.swapLp + rev.flashLp;
      const apr = computeLpApr(lpFees, snaps.map((s) => s.net_par as number));
      // Share price growth from the close of the day before the window to the latest snapshot, so
      // it spans the same days as the fees. Base at the bLP redemption price (what an LP exits at),
      // a Meta at its reserve value per share. It holds what fees leave out: deposit and
      // withdrawal pricing, rebalances, and the Base LP a Meta holds.
      const navPoints = tvlRows.results
        .filter((s) => s.contract === r.address && s.date >= sinceDate(APR_DAYS + 1))
        .map((s) => {
          if (r.kind === "base") return { date: s.date, nav: prices.get(s.date) ?? null };
          const supply = (JSON.parse(s.state_json) as { supply?: number }).supply;
          return { date: s.date, nav: s.net_par !== null && supply ? s.net_par / supply : null };
        })
        .filter((p): p is { date: string; nav: number } => p.nav !== null);
      const nav = computeNavApr(navPoints);
      return {
        address: r.address, lpFees, days: snaps.length, apr,
        navApr: nav.apr, navDays: nav.days, navStart: nav.navStart, navEnd: nav.navEnd,
        otherApr: nav.apr !== null && apr !== null ? nav.apr - apr : null,
      };
    });
    const poolVolume7d = reg.pools.map((p) => ({
      address: p.address,
      volume: computeVolume(pools7.filter((e) => e.contract === p.address), prices).reserveLegVolume,
    }));
    const entryPoints = [...new Set(pools7.map((e) => e.tx_to ?? "unknown"))].map((entry) => {
      const rows = pools7.filter((e) => (e.tx_to ?? "unknown") === entry);
      return { entry, swaps: rows.length, volume: computeVolume(rows, prices).reserveLegVolume };
    });
    // Every calendar day from the first event to today: a day with no events is a real zero,
    // and skipping it would bend the time axis.
    const dates: string[] = [];
    if (firstDate !== null) {
      const today = sinceDate(1);
      for (let t = Date.parse(firstDate); ; t += 86_400_000) {
        const d = new Date(t).toISOString().slice(0, 10);
        if (d > today) break;
        dates.push(d);
      }
    }
    const daily = dates.map((date) => {
      const day = events.filter((e) => e.date === date);
      const rebalances = day.filter((e) => e.kind === "rebalance");
      const revenue = computeRevenue(day, prices);
      return {
        date,
        swapVolume: computeVolume(day.filter((e) => e.kind === "swap"), prices).swapVolume,
        revenue: revenue.total,
        // What swappers paid, by who received it. The trader share is a rebate, so it is not in revenue.
        swapFees: { lp: revenue.swapLp, treasury: revenue.swapTreasury, trader: revenue.traderRebate },
        // One event per rebalance, so the per-event sum is the volume moved.
        rebalanceVolume: computeVolume(rebalances, prices).reserveLegVolume,
        rebalanceCount: rebalances.length,
      };
    });

    const tvl = state
      ? computeTvl(state.reserves)
      : { grossTvl: null, iouDebt: null, netTvl: null, partial: true };
    // Any unreadable balance makes the total unknown: never show a partial sum.
    const adminBalances = state ? state.pools.flatMap((p) => p.adminBalances) : [];
    const curveAdminPending = state && !adminBalances.some((b) => b === null)
      ? adminBalances.reduce<number>((a, b) => a + (b as number), 0)
      : null;

    const reserveKind = new Map(reg.reserves.map((r) => [r.address, r.kind]));
    const reserveRows = tvlRows.results.filter((r) => reserveKind.has(r.contract));
    const dailyTvl = [...new Set(reserveRows.map((r) => r.date))].map((date) => {
      const t = computeTvl(reserveRows.filter((r) => r.date === date).map((r) => ({
        kind: reserveKind.get(r.contract)!,
        grossPar: r.gross_par,
        nativeValue: (JSON.parse(r.state_json) as { nativeValue?: number }).nativeValue ?? null,
        iouDebtPar: r.iou_debt_par,
      })));
      return { date, grossTvl: t.grossTvl, netTvl: t.netTvl };
    });

    // Sève's stake in each reserve, and how much of the activity its Safes did themselves.
    // A Safe shows up as the actor, an EOA as tx_from.
    const seveAddresses = new Set<string>(SEVE_SAFES.map((s) => s.address));
    const bySeve = events.filter((e) => seveAddresses.has(e.actor ?? "") || seveAddresses.has(e.tx_from ?? ""));
    const positions = (state?.reserves ?? []).map((r) => {
      const share = r.seveShares != null && r.supply ? r.seveShares / r.supply : r.seveShares === 0 ? 0 : null;
      return { address: r.address, share, value: share === null || r.netPar === null ? null : share * r.netPar };
    });
    const seve = {
      positions,
      // Any unpriced stake makes the total unknown: never show a partial sum.
      value: state && !positions.some((p) => p.value === null)
        ? positions.reduce((a, p) => a + (p.value as number), 0)
        : null,
      allTime: {
        swapVolume: computeVolume(bySeve.filter((e) => e.kind === "swap"), prices).swapVolume,
        rebalanceVolume: rebalanceVolume(bySeve),
        rebalanceCount: bySeve.filter((e) => e.kind === "rebalance").length,
      },
    };

    const known = new Set(reg.reserves.map((r) => r.address));
    const created = await db
      .prepare("SELECT args_json FROM clear_v1_events WHERE event_name = 'NewClearReserve'")
      .all<{ args_json: string }>();
    const unknownReserves = created.results
      .map((r) => (JSON.parse(r.args_json) as { reserve: string }).reserve.toLowerCase())
      .filter((a) => !known.has(a));

    const [eventsUpdatedAt, eventsBlock, syncedAt] = await Promise.all([
      newestEventTimestamp(db), getLastBlock(db, EVENTS_CURSOR), eventsSyncedAt(db),
    ]);

    return ok({
      state, tvl, curveAdminPending, periods, allTime, seve, reserveVolume7d, reserveLpApr7d, poolVolume7d, entryPoints, daily, dailyTvl, unknownReserves,
      tokens: reg.tokens,
      discovery: { reserves: discovered.reserves.map((r) => r.address), pools: discovered.pools.map((p) => p.address), backfillJobs: discovered.backfill.length },
      updatedAt: state?.updatedAt ?? null, eventsUpdatedAt, eventsBlock, eventsSyncedAt: syncedAt,
    });
  } catch (err) {
    return fail("clear-v1-overview", err);
  }
}

const MAX_ACTORS = 10;

export async function handleClearV1Activity(db: D1Database, url: URL): Promise<Response> {
  try {
    const kinds = [...new Set((url.searchParams.get("kind") ?? "").split(",").map((k) => k.trim()))]
      .filter((k) => KNOWN_KINDS.has(k));
    const contract = url.searchParams.get("contract")?.toLowerCase();
    const actors = (url.searchParams.get("actor") ?? "").split(",").map((a) => a.trim().toLowerCase())
      .filter((a) => /^0x[0-9a-f]{40}$/.test(a)).slice(0, MAX_ACTORS);
    const limit = Math.max(1, Math.min(Math.floor(Number(url.searchParams.get("limit") ?? 50)) || 50, 200));
    const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset") ?? 0)) || 0);
    const where: string[] = [];
    const binds: (string | number)[] = [];
    if (kinds.length) { where.push(`kind IN (${kinds.map(() => "?").join(", ")})`); binds.push(...kinds); }
    if (contract) { where.push("contract = ?"); binds.push(contract); }
    // A Safe shows up as the actor, and an EOA as tx_from.
    if (actors.length) {
      const marks = actors.map(() => "?").join(", ");
      where.push(`(actor IN (${marks}) OR tx_from IN (${marks}))`);
      binds.push(...actors, ...actors);
    }
    const sql =
      `SELECT tx_hash, log_index, block_number, timestamp, contract, kind, event_name, actor, tx_from, tx_to,
              token_in, token_out, volume_token, volume_units
       FROM clear_v1_events ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY block_number DESC, log_index DESC LIMIT ? OFFSET ?`;
    const [rows, updatedAt, { registry }] = await Promise.all([
      db.prepare(sql).bind(...binds, limit, offset).all(),
      newestEventTimestamp(db),
      loadRegistry(db),
    ]);
    return ok({ events: rows.results, updatedAt, tokens: registry.tokens });
  } catch (err) {
    return fail("clear-v1-activity", err);
  }
}

export async function handleClearV1Gas(db: D1Database): Promise<Response> {
  try {
    const cached = await getCache(db, STATE_CACHE_KEY);
    const state = cached ? (JSON.parse(cached.value) as V1State) : null;
    const rows = await db
      .prepare(
        `SELECT wallet, date, COUNT(*) txs, SUM(failed) failed, SUM(gas_cost_eth) gas_eth,
                SUM(value_eth) value_eth, SUM(gas_cost_usd) gas_usd
         FROM clear_v1_gas_txs WHERE date >= ? GROUP BY wallet, date ORDER BY date`
      )
      .bind(sinceDate(30))
      .all<{ wallet: string; date: string; txs: number; failed: number; gas_eth: number; value_eth: number; gas_usd: number | null }>();

    const txPrices = await db
      .prepare("SELECT wallet, gas_price_gwei p, timestamp ts, gas_cost_eth + value_eth eth FROM clear_v1_gas_txs WHERE date >= ?")
      .bind(sinceDate(30))
      .all<{ wallet: string; p: number; ts: number; eth: number }>();

    const wallets = V1_GAS_WATCHLIST.map((w) => {
      const days = rows.results.filter((r) => r.wallet === w.address);
      const window = (n: number) => days.filter((d) => d.date >= sinceDate(n));
      const sum = (ds: typeof days, f: (d: (typeof days)[number]) => number) => ds.reduce((a, d) => a + f(d), 0);
      const last7 = window(7);
      // Calendar days since the first tx, so quiet days count as zero spend.
      const span = days.length ? Math.floor((Date.now() - Date.parse(days[0].date)) / 86_400_000) + 1 : 0;
      const dailyEth = span ? sum(last7, (d) => d.gas_eth + d.value_eth) / Math.min(7, span) : 0;
      const balanceEth = state?.wallets.find((x) => x.address === w.address)?.balanceEth ?? null;
      const walletTxs = txPrices.results.filter((t) => t.wallet === w.address);
      const gwei = walletTxs.map((t) => t.p);
      const avgGwei = gwei.reduce((a, b) => a + b, 0) / (gwei.length || 1);
      const p95Gwei = percentile(gwei, 0.95);
      const burnPerHour = computeBurnPerHour(walletTxs, Math.floor(Date.now() / 1000));
      return {
        ...w,
        balanceEth,
        burnEthPerDay: burnPerHour * 24,
        runwayHours: balanceEth === null || burnPerHour <= 0 ? null : balanceEth / burnPerHour,
        runwayDays: balanceEth === null ? null : computeRunway(balanceEth, dailyEth, span),
        runwayDaysAtP95Gas: balanceEth === null || p95Gwei === null || avgGwei === 0
          ? null
          : computeRunway(balanceEth, dailyEth * (p95Gwei / avgGwei), span),
        spend: [1, 7, 30].map((n) => {
          const ds = window(n);
          return {
            days: n,
            eth: sum(ds, (d) => d.gas_eth + d.value_eth),
            usd: sum(ds, (d) => d.gas_usd ?? 0),
            txs: sum(ds, (d) => d.txs),
            failed: sum(ds, (d) => d.failed),
          };
        }),
        daily: days.map((d) => ({ date: d.date, eth: d.gas_eth + d.value_eth, txs: d.txs })),
      };
    });
    return ok({ wallets, updatedAt: state?.updatedAt ?? null });
  } catch (err) {
    return fail("clear-v1-gas", err);
  }
}
