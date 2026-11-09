import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { compact, poolSnapshotJson, routePairs, spotRoutes, UPSERT_SNAPSHOT_SQL } from "../../cron/sync-clear-v1-state";
import { V1_RESERVES } from "@shared/lib/clear-v1-config";

describe("compact", () => {
  it("drops null fields so json_patch keeps the prior value", () => {
    const out = JSON.parse(compact({ nativeValue: null, supply: 5, params: { a: null, b: 2 } }));
    expect(out).toEqual({ supply: 5, params: { b: 2 } });
    expect("nativeValue" in out).toBe(false);
  });
});

describe("poolSnapshotJson", () => {
  const pool = { address: "0xp", label: "p", coins: ["0xaaa", "0xbbb"], balances: [1.5, null], adminBalances: [null, 0.2] };
  it("keys balances by coin address and drops failed entries", () => {
    expect(JSON.parse(poolSnapshotJson(pool))).toEqual({
      balances: { "0xaaa": 1.5 },
      adminBalances: { "0xbbb": 0.2 },
    });
  });
});

describe("clear_v1_snapshots upsert on real SQLite", () => {
  const migration = readFileSync(resolve(__dirname, "../../../migrations/0032_clear_v1.sql"), "utf8");
  const tableSql = migration.match(/CREATE TABLE clear_v1_snapshots \([\s\S]*?\);/)![0];

  const setup = () => {
    const db = new DatabaseSync(":memory:");
    db.exec(tableSql);
    return db;
  };
  const run = (db: DatabaseSync, grossPar: number | null, json: string) =>
    db.prepare(UPSERT_SNAPSHOT_SQL).run("2026-11-04", "0xc", grossPar, 5, null, null, json);
  const read = (db: DatabaseSync) => {
    const row = db.prepare("SELECT * FROM clear_v1_snapshots").get() as {
      gross_par: number | null; net_par: number | null; state_json: string;
    };
    return { ...row, json: JSON.parse(row.state_json) };
  };

  it("keeps good values over nulls and replaces them with later good values", () => {
    const db = setup();
    run(db, 100, compact({
      nativeValue: 40, supply: 7,
      balances: { "0xaaa": 1, "0xbbb": 2 },
    }));
    expect(read(db).gross_par).toBe(100);

    // Second run: gross_par null, nativeValue and one pool balance failed.
    run(db, null, compact({
      nativeValue: null, supply: 8,
      balances: { "0xaaa": null, "0xbbb": 3 },
    }));
    let r = read(db);
    expect(r.gross_par).toBe(100);
    expect(r.json.nativeValue).toBe(40);
    expect(r.json.supply).toBe(8);
    expect(r.json.balances).toEqual({ "0xaaa": 1, "0xbbb": 3 });

    // Later good values replace the old ones.
    run(db, 110, compact({ nativeValue: 45, balances: { "0xaaa": 1.5, "0xbbb": 3 } }));
    r = read(db);
    expect(r.gross_par).toBe(110);
    expect(r.json.nativeValue).toBe(45);
    expect(r.json.balances).toEqual({ "0xaaa": 1.5, "0xbbb": 3 });
    db.close();
  });
});

describe("routePairs", () => {
  it("lists both directions of every reserve leg pair", () => {
    const pairs = routePairs(V1_RESERVES);
    expect(pairs).toHaveLength(10); // Base USDC/USDT, then native/bLP for 4 Metas
    expect(pairs).toContainEqual({
      reserve: "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d",
      tokenIn: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      tokenOut: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    });
    expect(pairs).toContainEqual({
      reserve: "0x15954f33c25828156f8d8f1de564e1e48889197f",
      tokenIn: "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d",
      tokenOut: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f",
    });
  });
});

describe("spotRoutes", () => {
  const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
  const PYUSD = "0x6c3ea9036406852006290770bedfcaba0e23a0e8";
  const USDS = "0xdc035d45d973e3ec169d2276ddab16f1e407384f";
  const GHO = "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f";
  const BASE = "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d";
  const META_USDS = "0x070f56b62e3352d6d8fa52024bbf4c51d6917317";
  const META_PYUSD = "0x4ff500233d1898ae2ac5ad61296780ba35dcaed4";
  const META_GHO = "0x15954f33c25828156f8d8f1de564e1e48889197f";
  const allOpen = () => true;
  const find = (rs: ReturnType<typeof spotRoutes>, a: string, b: string) => rs.find((r) => r.tokenIn === a && r.tokenOut === b)!;

  it("lists every ordered pair of spot tokens, never bLP", () => {
    const rs = spotRoutes(V1_RESERVES, allOpen);
    expect(rs).toHaveLength(30); // USDC, USDT, PYUSD, USDG, USDS, GHO
    expect(rs.some((r) => r.tokenIn === BASE || r.tokenOut === BASE)).toBe(false);
  });
  it("routes Base assets through the Base swap", () => {
    expect(find(spotRoutes(V1_RESERVES, allOpen), USDT, USDC).hops)
      .toEqual([{ reserve: BASE, tokenIn: USDT, tokenOut: USDC, via: "swap", open: true }]);
  });
  it("routes a native to a Base asset as Meta swap then Base single-asset withdraw, as traced on-chain", () => {
    expect(find(spotRoutes(V1_RESERVES, allOpen), USDS, USDC).hops).toEqual([
      { reserve: META_USDS, tokenIn: USDS, tokenOut: BASE, via: "swap", open: true },
      { reserve: BASE, tokenIn: BASE, tokenOut: USDC, via: "withdraw", open: true },
    ]);
  });
  it("routes a Base asset to a native as Base single-asset deposit then Meta swap", () => {
    expect(find(spotRoutes(V1_RESERVES, allOpen), USDT, GHO).hops.map((h) => [h.reserve, h.via]))
      .toEqual([[BASE, "deposit"], [META_GHO, "swap"]]);
  });
  it("routes native to native through two Meta swaps meeting at bLP", () => {
    expect(find(spotRoutes(V1_RESERVES, allOpen), PYUSD, GHO).hops.map((h) => [h.reserve, h.tokenIn, h.tokenOut]))
      .toEqual([[META_PYUSD, PYUSD, BASE], [META_GHO, BASE, GHO]]);
  });
  it("is open only when every hop is open, and unknown when a hop is unknown and none is shut", () => {
    const shutWithdraw = spotRoutes(V1_RESERVES, (h) => h.via !== "withdraw");
    expect(find(shutWithdraw, USDS, USDC).open).toBe(false);
    expect(find(shutWithdraw, USDS, PYUSD).open).toBe(true);
    const unknownSwap = spotRoutes(V1_RESERVES, (h) => (h.via === "swap" ? null : true));
    expect(find(unknownSwap, USDS, USDC).open).toBeNull();
    const mixed = spotRoutes(V1_RESERVES, (h) => (h.via === "swap" ? null : false));
    expect(find(mixed, USDS, USDC).open).toBe(false);
  });
});
