import { describe, expect, it } from "vitest";
import { carryBook } from "../seve-carry";

describe("carryBook", () => {
  it("reproduces the book at the 20 Oct snapshot", () => {
    const b = carryBook(50_400.04, 10);
    expect(b.interest).toBeCloseTo(400.04, 2);
    expect(b.owed).toBeCloseTo(50_390.04, 2);
    expect(b.net).toBeCloseTo(-12.61, 2);
  });
  it("keeps accruing interest on the full loan after a partial repayment", () => {
    const b = carryBook(50_532, 30_270);
    expect(b.interest).toBeCloseTo(532, 2);
    expect(b.owed).toBeCloseTo(20_262, 2);
  });
});
