import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { compact, poolSnapshotJson, UPSERT_SNAPSHOT_SQL } from "../../cron/sync-clear-v1-state";

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
