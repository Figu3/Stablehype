import { describe, expect, it } from "vitest";
import { carryBook } from "../seve-carry";

const FIRST = [{ date: null, amount: 50_000, scaled: 49_999.807887 }];

describe("carryBook", () => {
  it("reproduces the book at the 20 Oct snapshot", () => {
    const b = carryBook(50_400.04, 10, 49_999.807887, FIRST);
    expect(b.principal).toBe(50_000);
    expect(b.interest).toBeCloseTo(400.04, 2);
    expect(b.owed).toBeCloseTo(50_390.04, 2);
    expect(b.net).toBeCloseTo(-12.61, 2);
  });
  it("keeps accruing interest on the full loan after a partial repayment", () => {
    const b = carryBook(50_532, 30_270, 49_999.807887, FIRST);
    expect(b.interest).toBeCloseTo(532, 2);
    expect(b.owed).toBeCloseTo(20_262, 2);
  });
  it("counts the 6 Nov deposit as principal, not interest (market read of 11 Nov)", () => {
    const b = carryBook(150_696.079864, 25_257.188166, 148_917.810607);
    expect(b.principal).toBe(150_000);
    expect(b.interest).toBeCloseTo(696.08, 2);
    expect(b.owed).toBeCloseTo(125_438.89, 2);
  });
  it("gives no interest or net when the market holds tokens the ledger does not know", () => {
    // A new 20,000 deposit the ledger has not recorded.
    const b = carryBook(170_700, 25_000, 168_700);
    expect(b.principal).toBeNull();
    expect(b.interest).toBeNull();
    expect(b.net).toBeNull();
    expect(b.debt).toBe(170_700);
    expect(b.owed).toBe(145_700);
  });
});
