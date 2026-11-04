import { describe, expect, it } from "vitest";
import { compact } from "../../cron/sync-clear-v1-state";

describe("compact", () => {
  it("drops null fields so json_patch keeps the prior value", () => {
    const out = JSON.parse(compact({ nativeValue: null, supply: 5, params: { a: null, b: 2 } }));
    expect(out).toEqual({ supply: 5, params: { b: 2 } });
    expect("nativeValue" in out).toBe(false);
  });
});
