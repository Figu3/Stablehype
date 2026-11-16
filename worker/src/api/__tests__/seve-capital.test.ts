import { describe, expect, it } from "vitest";
import { beingConverted } from "../seve-capital";

describe("beingConverted", () => {
  // Blocks and amounts of 12 Nov 2026: two sends, one payment, one more send.
  const sent = [
    { block: 26400269, amount: 15_699.85 },
    { block: 26400283, amount: 3_754.27 },
    { block: 26400369, amount: 19_459.66 },
  ];

  it("counts only what was sent after the issuer's last payment", () => {
    expect(beingConverted(sent, 26400353)).toBeCloseTo(19_459.66, 2);
  });
  it("is zero once a payment lands after the last send", () => {
    expect(beingConverted(sent, 26400444)).toBe(0);
  });
  it("counts every send when no payment came back in the window", () => {
    expect(beingConverted(sent, null)).toBeCloseTo(38_913.78, 2);
  });
});
