import { describe, expect, it } from "vitest";
import { handleClearV1Activity, handleClearV1Gas, handleClearV1Overview } from "../clear-v1";
import { STATE_CACHE_KEY } from "../../cron/sync-clear-v1-state";
import { V1_BASE_RESERVE, V1_GAS_WATCHLIST } from "@shared/lib/clear-v1-config";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

type Handler = (sql: string, binds: unknown[]) => unknown[] | { value: string; updated_at: number } | null;

/** Fake D1: `handler` gets the SQL and bound values, and returns the rows. */
function fakeDb(handler: Handler) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...b: unknown[]) { binds = b; return stmt; },
        async all() { calls.push({ sql, binds }); return { results: (handler(sql, binds) as unknown[]) ?? [] }; },
        async first() { calls.push({ sql, binds }); return handler(sql, binds) as unknown; },
      };
      return stmt;
    },
  };
  return { db: db as unknown as D1Database, calls };
}

const swap = (tx: string, date: string, units: number, extra: object = {}) => ({
  tx_hash: tx, date, contract: V1_BASE_RESERVE, kind: "swap", tx_to: null,
  token_in: USDT, token_out: USDC, amount_in_raw: "1", amount_out_raw: "1",
  volume_token: USDC, volume_units: units, fee_token: USDT,
  fee_treasury_units: 0, fee_lp_units: 0, fee_trader_units: 0, ...extra,
});

describe("clear-v1 overview", () => {
  it("excludes yesterday from the 1-day window and counts a two-leg swap once", async () => {
    const events = [
      swap("0xa", day(0), 100),
      swap("0xa", day(0), 100, { contract: "0x4ff500233d1898ae2ac5ad61296780ba35dcaed4" }), // second leg, same tx
      swap("0xb", day(1), 50),
    ];
    const { db } = fakeDb((sql) => {
      if (sql.includes("FROM cache")) return null;
      if (sql.includes("FROM clear_v1_events") && sql.includes("kind IN")) return events;
      return [];
    });
    const body = await (await handleClearV1Overview(db)).json() as { periods: { days: number; swapVolume: number; reserveLegVolume: number; swapCount: number }[] };
    const [d1, d7] = body.periods;
    expect(d1.swapVolume).toBe(100);
    expect(d1.swapCount).toBe(1);
    expect(d1.reserveLegVolume).toBe(200);
    expect(d7.swapVolume).toBe(150);
    expect(d7.swapCount).toBe(2);
  });

  it("fills quiet days with zeros and serves a 90-day period", async () => {
    const events = [swap("0xa", day(0), 100), swap("0xb", day(3), 50), swap("0xc", day(40), 10)];
    const { db } = fakeDb((sql) => {
      if (sql.includes("FROM cache")) return null;
      if (sql.includes("FROM clear_v1_events") && sql.includes("kind IN")) return events;
      return [];
    });
    const body = await (await handleClearV1Overview(db)).json() as {
      daily: { date: string; swapVolume: number; rebalanceCount: number }[];
      periods: { days: number; swapVolume: number; rebalanceVolume: number; previous: { swapVolume: number } | null }[];
    };
    expect(body.daily).toHaveLength(41);
    expect(body.daily[0].date).toBe(day(40));
    expect(body.daily.at(-1)!.date).toBe(day(0));
    expect(body.daily.find((d) => d.date === day(1))).toMatchObject({ swapVolume: 0, rebalanceCount: 0 });
    const p = (n: number) => body.periods.find((x) => x.days === n)!;
    expect(p(30).swapVolume).toBe(150);
    expect(p(90).swapVolume).toBe(160);
    expect(p(90).rebalanceVolume).toBe(0);
    // History starts 40 days back: it covers the 7 and 14 day windows whole, but not the 30 days before the last 30.
    expect(p(7).previous).toEqual({ swapVolume: 0, revenue: 0, rebalanceVolume: 0 });
    expect(p(30).previous).toBeNull();
  });

  it("reports rebalance volume and count per day, apart from swap volume", async () => {
    const rebalance = (tx: string, date: string, units: number) =>
      swap(tx, date, units, { kind: "rebalance" });
    const events = [
      swap("0xa", day(0), 100),
      rebalance("0xr1", day(0), 40),
      rebalance("0xr2", day(0), 60),
      rebalance("0xr3", day(1), 25),
    ];
    const { db } = fakeDb((sql) => {
      if (sql.includes("FROM cache")) return null;
      if (sql.includes("FROM clear_v1_events") && sql.includes("kind IN")) return events;
      return [];
    });
    const body = await (await handleClearV1Overview(db)).json() as {
      daily: { date: string; swapVolume: number; rebalanceVolume: number; rebalanceCount: number }[];
    };
    const today = body.daily.find((d) => d.date === day(0))!;
    const yesterday = body.daily.find((d) => d.date === day(1))!;
    expect(today.swapVolume).toBe(100);
    expect(today.rebalanceVolume).toBe(100);
    expect(today.rebalanceCount).toBe(2);
    expect(yesterday.swapVolume).toBe(0);
    expect(yesterday.rebalanceVolume).toBe(25);
    expect(yesterday.rebalanceCount).toBe(1);
  });

  it("serves all-time totals and a daily series back to the first event", async () => {
    const events = [swap("0xa", day(0), 100), swap("0xb", day(200), 40, { fee_lp_units: 1 })];
    const { db } = fakeDb((sql) => {
      if (sql.includes("FROM cache")) return null;
      if (sql.includes("FROM clear_v1_events") && sql.includes("kind IN")) return events;
      return [];
    });
    const body = await (await handleClearV1Overview(db)).json() as {
      daily: { date: string }[];
      periods: { days: number; swapVolume: number }[];
      allTime: { days: number; swapVolume: number; swapCount: number; revenue: { total: number }; previous: unknown };
    };
    expect(body.periods.find((p) => p.days === 90)!.swapVolume).toBe(100);
    expect(body.allTime).toMatchObject({ days: 201, swapVolume: 140, swapCount: 2, previous: null });
    expect(body.allTime.revenue.total).toBe(1);
    expect(body.daily).toHaveLength(201);
    expect(body.daily[0].date).toBe(day(200));
  });

  it("reports Sève's stake per reserve and the activity its Safes did", async () => {
    const SAFE = "0x7552b3764b5e34a4d15565836885daa50c35ab85";
    const reserve = (address: string, seveShares: number | null, netPar: number | null) => ({
      address, label: address, kind: "base", grossPar: netPar, netPar, iouDebtPar: 0, nativeValue: null, baseLpValue: null,
      supply: 1_000, seveShares, paused: false, rebalanceNeeded: false, params: {},
    });
    const state = (reserves: unknown[]) => JSON.stringify({ updatedAt: 1, blpRedemptionPrice: 1, reserves, pools: [], feeds: [], wallets: [] });
    const events = [
      swap("0xa", day(0), 100),
      swap("0xb", day(0), 50, { actor: SAFE }),
      swap("0xr", day(1), 80, { kind: "rebalance", tx_from: SAFE }),
      swap("0xs", day(1), 20, { kind: "rebalance" }),
    ];
    const run = async (reserves: unknown[]) => {
      const { db } = fakeDb((sql) => {
        if (sql.includes("FROM cache")) return { value: state(reserves), updated_at: 1 };
        if (sql.includes("FROM clear_v1_events") && sql.includes("kind IN")) return events;
        return [];
      });
      return (await (await handleClearV1Overview(db)).json() as {
        seve: { positions: { address: string; share: number | null; value: number | null }[]; value: number | null;
          allTime: { swapVolume: number; rebalanceVolume: number; rebalanceCount: number } };
      }).seve;
    };
    const seve = await run([reserve("0x1", 250, 2_000), reserve("0x2", 1_000, 500)]);
    expect(seve.positions).toEqual([{ address: "0x1", share: 0.25, value: 500 }, { address: "0x2", share: 1, value: 500 }]);
    expect(seve.value).toBe(1_000);
    expect(seve.allTime).toEqual({ swapVolume: 50, rebalanceVolume: 80, rebalanceCount: 1 });
    // One unread balance makes the total unknown rather than a partial sum.
    expect((await run([reserve("0x1", 250, 2_000), reserve("0x2", null, 500)])).value).toBeNull();
  });

  it("splits daily swap fees by recipient and gives each reserve an LP APR over its snapshot days", async () => {
    const events = [
      swap("0xa", day(0), 10_000, { fee_lp_units: 2, fee_treasury_units: 2, fee_trader_units: 1 }),
      swap("0xb", day(2), 10_000, { fee_lp_units: 1.65 }),
      swap("0xc", day(5), 10_000, { fee_lp_units: 99 }), // no snapshot that day: outside the APR
    ];
    const snapshots = [2, 1, 0].map((d) => ({
      date: day(d), contract: V1_BASE_RESERVE, gross_par: 36_500, net_par: 36_500, iou_debt_par: 0, state_json: "{}",
    }));
    const { db } = fakeDb((sql) => {
      if (sql.includes("FROM cache")) return null;
      if (sql.includes("FROM clear_v1_events") && sql.includes("kind IN")) return events;
      if (sql.includes("net_par")) return snapshots;
      return [];
    });
    const body = await (await handleClearV1Overview(db)).json() as {
      daily: { date: string; swapFees: { lp: number; treasury: number; trader: number } }[];
      reserveLpApr7d: { address: string; lpFees: number; days: number; apr: number | null }[];
    };
    expect(body.daily.find((d) => d.date === day(0))!.swapFees).toEqual({ lp: 2, treasury: 2, trader: 1 });
    expect(body.daily.find((d) => d.date === day(1))!.swapFees).toEqual({ lp: 0, treasury: 0, trader: 0 });
    const base = body.reserveLpApr7d.find((r) => r.address === V1_BASE_RESERVE)!;
    // $3.65 in 3 days on $36,500: 0.01% in 3 days, 1.2167% a year.
    expect(base).toMatchObject({ lpFees: 3.65, days: 3 });
    expect(base.apr).toBeCloseTo((3.65 / 36_500) * (365 / 3) * 100, 9);
    // A reserve with no snapshot has no rate rather than a zero one.
    expect(body.reserveLpApr7d.find((r) => r.address !== V1_BASE_RESERVE)!.apr).toBeNull();
  });

  it("returns null TVL with partial true when there is no state, instead of throwing", async () => {
    const { db } = fakeDb(() => null);
    const res = await handleClearV1Overview(db);
    expect(res.status).toBe(200);
    const body = await res.json() as { tvl: { grossTvl: number | null; partial: boolean }; state: unknown; updatedAt: unknown };
    expect(body.tvl.grossTvl).toBeNull();
    expect(body.tvl.partial).toBe(true);
    expect(body.state).toBeNull();
    expect(body.updatedAt).toBeNull();
  });
});

describe("clear-v1 activity", () => {
  const run = async (qs: string) => {
    const { db, calls } = fakeDb((sql) =>
      sql.includes("FROM cache") ? null : sql.includes("MAX(timestamp)") ? { t: 1234 } : []);
    const res = await handleClearV1Activity(db, new URL(`https://x/api/clear-v1-activity?${qs}`));
    return { calls: calls.filter((c) => c.sql.includes("LIMIT")), body: await res.json() as { events: unknown[]; updatedAt: number | null } };
  };

  it("caps limit at 200 and filters by kind", async () => {
    const { calls } = await run("limit=9999&kind=swap&offset=5");
    expect(calls[0].binds).toEqual(["swap", 200, 5]);
    expect(calls[0].sql).toContain("kind IN (?)");
  });

  it("filters by actor or tx sender, lowercased, and drops malformed addresses", async () => {
    const safe = "0x16d9ba632757914c3A1BA9291F23Fa075F24c3bc";
    const { calls } = await run(`actor=${safe},nonsense`);
    expect(calls[0].sql).toContain("(actor IN (?) OR tx_from IN (?))");
    expect(calls[0].binds).toEqual([safe.toLowerCase(), safe.toLowerCase(), 50, 0]);
  });

  it("clamps a negative limit to 1 so SQLite never sees LIMIT -1", async () => {
    const { calls } = await run("limit=-1");
    expect(calls[0].binds).toEqual([1, 0]);
  });

  it("floors a fractional limit", async () => {
    const { calls } = await run("limit=2.5");
    expect(calls[0].binds).toEqual([2, 0]);
  });

  it("clamps a negative offset to 0", async () => {
    const { calls } = await run("offset=-5");
    expect(calls[0].binds).toEqual([50, 0]);
  });

  it("binds a comma-separated kind list with IN and drops unknown kinds", async () => {
    const { calls } = await run("kind=deposit,withdraw,bogus,pool_liquidity");
    expect(calls[0].sql).toContain("kind IN (?, ?, ?)");
    expect(calls[0].binds).toEqual(["deposit", "withdraw", "pool_liquidity", 50, 0]);
  });

  it("applies no kind filter when every requested kind is unknown", async () => {
    const { calls } = await run("kind=bogus");
    expect(calls[0].sql).not.toContain("kind IN");
    expect(calls[0].binds).toEqual([50, 0]);
  });

  it("returns the timestamp of the newest row as updatedAt", async () => {
    const { body } = await run("");
    expect(body.updatedAt).toBe(1234);
  });

  it("returns null updatedAt on an empty table", async () => {
    const { db } = fakeDb(() => null);
    const body = await (await handleClearV1Activity(db, new URL("https://x/a"))).json() as { updatedAt: number | null };
    expect(body.updatedAt).toBeNull();
  });
});

describe("clear-v1 overview freshness and admin pending", () => {
  const stateWith = (adminBalances: (number | null)[][]) => ({
    updatedAt: 1, reserves: [], wallets: [], feeds: [],
    pools: adminBalances.map((a, i) => ({ address: `0x${i}`, label: "p", coins: [], balances: [], adminBalances: a })),
  });
  const overview = async (state: unknown, extra?: (sql: string) => unknown) => {
    const { db } = fakeDb((sql) => {
      if (sql.includes("FROM cache")) return state ? { value: JSON.stringify(state), updated_at: 1 } : null;
      const e = extra?.(sql);
      return e === undefined ? [] : (e as unknown[]);
    });
    return await (await handleClearV1Overview(db)).json() as {
      curveAdminPending: number | null; eventsUpdatedAt: number | null; eventsBlock: number; eventsSyncedAt: number | null;
    };
  };

  it("sums curveAdminPending when every value is present", async () => {
    expect((await overview(stateWith([[1, 2], [3]]))).curveAdminPending).toBe(6);
  });

  it("returns null curveAdminPending when any value is null, not a partial sum", async () => {
    expect((await overview(stateWith([[1, null], [3]]))).curveAdminPending).toBeNull();
  });

  it("exposes eventsUpdatedAt, eventsBlock and eventsSyncedAt", async () => {
    const body = await overview(null, (sql) => {
      if (sql.includes("MAX(timestamp)")) return { t: 1700 };
      if (sql.includes("blacklist_sync_state")) return { last_block: 25_000_000 };
      if (sql.includes("cron_health")) return { last_success: 1800 };
      return undefined;
    });
    expect(body.eventsUpdatedAt).toBe(1700);
    expect(body.eventsBlock).toBe(25_000_000);
    expect(body.eventsSyncedAt).toBe(1800);
  });

  it("returns null freshness fields when nothing has synced", async () => {
    const { db } = fakeDb(() => null);
    const body = await (await handleClearV1Overview(db)).json() as { eventsUpdatedAt: number | null; eventsBlock: number; eventsSyncedAt: number | null };
    expect(body.eventsUpdatedAt).toBeNull();
    expect(body.eventsBlock).toBe(0);
    expect(body.eventsSyncedAt).toBeNull();
  });
});

describe("clear-v1 gas", () => {
  it("returns a per-wallet spend window that excludes older days", async () => {
    const wallet = V1_GAS_WATCHLIST[0].address;
    const state = { updatedAt: 1, wallets: [{ address: wallet, label: "k", balanceEth: 1 }] };
    const { db } = fakeDb((sql) => {
      if (sql.includes("FROM cache")) return { value: JSON.stringify(state), updated_at: 1 };
      if (sql.includes("GROUP BY")) {
        return [
          { wallet, date: day(0), txs: 2, failed: 0, gas_eth: 0.01, value_eth: 0, gas_usd: 30 },
          { wallet, date: day(3), txs: 1, failed: 1, gas_eth: 0.02, value_eth: 0, gas_usd: 60 },
        ];
      }
      return [{ wallet, p: 10 }, { wallet, p: 30 }];
    });
    expect(STATE_CACHE_KEY).toBeTruthy();
    const body = await (await handleClearV1Gas(db)).json() as { wallets: { address: string; balanceEth: number; spend: { days: number; eth: number; txs: number }[] }[] };
    const w = body.wallets.find((x) => x.address === wallet)!;
    expect(w.balanceEth).toBe(1);
    expect(w.spend[0]).toMatchObject({ days: 1, txs: 2 });
    expect(w.spend[0].eth).toBeCloseTo(0.01, 10);
    expect(w.spend[1].eth).toBeCloseTo(0.03, 10);
  });
});

describe("clear-v1 discovered registry", () => {
  const discovered = {
    reserves: [{ address: "0xnew", label: "Meta NEW", kind: "meta", legs: ["0xiounew", "0xbb"], createdBlock: 1 }],
    tokens: { "0xiounew": { symbol: "iouNEW", decimals: 6 } },
    pools: [], feeds: [], curve: null, backfill: [],
  };
  const db = () => fakeDb((sql, binds) => {
    if (sql.includes("FROM cache")) return binds[0] === "clear-v1-registry" ? { value: JSON.stringify(discovered), updated_at: 0 } : null;
    if (sql.includes("MAX(timestamp)")) return { t: 1 };
    return [];
  }).db;

  it("returns discovered token symbols with activity, so the UI can label them", async () => {
    const body = await (await handleClearV1Activity(db(), new URL("https://x/a"))).json() as { tokens: Record<string, { symbol: string }> };
    expect(body.tokens["0xiounew"].symbol).toBe("iouNEW");
    expect(body.tokens[USDC].symbol).toBe("USDC");
  });

  it("treats a discovered reserve as known in the overview", async () => {
    const body = await (await handleClearV1Overview(db())).json() as {
      reserveVolume7d: { address: string }[]; discovery: { reserves: string[] };
    };
    expect(body.reserveVolume7d.map((r) => r.address)).toContain("0xnew");
    expect(body.discovery.reserves).toEqual(["0xnew"]);
  });
});
