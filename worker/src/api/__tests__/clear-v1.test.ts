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
  it("caps limit at 200 and filters by kind", async () => {
    const { db, calls } = fakeDb(() => []);
    await handleClearV1Activity(db, new URL("https://x/api/clear-v1-activity?limit=9999&kind=swap&offset=5"));
    expect(calls[0].binds).toEqual(["swap", 200, 5]);
    expect(calls[0].sql).toContain("kind = ?");
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
