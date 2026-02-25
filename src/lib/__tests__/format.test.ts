import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPrice,
  formatNativePrice,
  formatPegDeviation,
  formatPercentChange,
  formatSupply,
  formatAddress,
  formatEventDate,
  formatDeathDate,
  formatDeathDateShort,
  formatPegStability,
  formatWorstDeviation,
} from "../format";

describe("formatCurrency", () => {
  it("formats trillions", () => {
    expect(formatCurrency(1.5e12)).toBe("$1.50T");
  });

  it("formats billions", () => {
    expect(formatCurrency(2.3e9)).toBe("$2.30B");
  });

  it("formats millions", () => {
    expect(formatCurrency(45.678e6)).toBe("$45.68M");
  });

  it("formats thousands", () => {
    expect(formatCurrency(9500)).toBe("$9.50K");
  });

  it("formats small values", () => {
    expect(formatCurrency(42.5)).toBe("$42.50");
  });

  it("handles negative values", () => {
    expect(formatCurrency(-2.5e9)).toBe("-$2.50B");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("handles Infinity", () => {
    expect(formatCurrency(Infinity)).toBe("N/A");
  });

  it("handles NaN", () => {
    expect(formatCurrency(NaN)).toBe("N/A");
  });

  it("respects custom decimals", () => {
    expect(formatCurrency(1.5e9, 0)).toBe("$2B");
    expect(formatCurrency(1.5e9, 3)).toBe("$1.500B");
  });
});

describe("formatPrice", () => {
  it("formats a normal price", () => {
    expect(formatPrice(1.0001)).toBe("$1.0001");
  });

  it("returns N/A for null", () => {
    expect(formatPrice(null)).toBe("N/A");
  });

  it("returns N/A for undefined", () => {
    expect(formatPrice(undefined)).toBe("N/A");
  });

  it("returns N/A for NaN", () => {
    expect(formatPrice(NaN)).toBe("N/A");
  });

  it("uses custom symbol", () => {
    expect(formatPrice(1.08, "€")).toBe("€1.0800");
  });
});

describe("formatNativePrice", () => {
  it("passes through USD-pegged prices unchanged", () => {
    expect(formatNativePrice(1.0001, "USD", 1)).toBe("$1.0001");
  });

  it("converts EUR-pegged prices", () => {
    // price $1.08, pegRef 1.08 → native price 1.0000
    expect(formatNativePrice(1.08, "EUR", 1.08)).toBe("€1.0000");
  });

  it("passes through GOLD prices as USD", () => {
    expect(formatNativePrice(3200, "GOLD", 3200)).toBe("$3200.0000");
  });

  it("returns N/A for null price", () => {
    expect(formatNativePrice(null, "EUR", 1.08)).toBe("N/A");
  });

  it("falls back to USD format when pegRef is zero", () => {
    expect(formatNativePrice(1.0, "EUR", 0)).toBe("$1.0000");
  });

  it("falls back to USD for unknown peg currency", () => {
    expect(formatNativePrice(1.5, "XYZ", 1.5)).toBe("$1.0000");
  });
});

describe("formatPegDeviation", () => {
  it("formats positive deviation", () => {
    expect(formatPegDeviation(1.005)).toBe("+50 bps");
  });

  it("formats negative deviation", () => {
    expect(formatPegDeviation(0.995)).toBe("-50 bps");
  });

  it("formats zero deviation", () => {
    expect(formatPegDeviation(1.0)).toBe("+0 bps");
  });

  it("handles custom peg value (EUR)", () => {
    // EUR stablecoin at $1.08 when EUR rate is $1.08 → 0 bps
    expect(formatPegDeviation(1.08, 1.08)).toBe("+0 bps");
  });

  it("returns N/A for null", () => {
    expect(formatPegDeviation(null)).toBe("N/A");
  });

  it("returns N/A for zero peg value", () => {
    expect(formatPegDeviation(1.0, 0)).toBe("N/A");
  });
});

describe("formatPercentChange", () => {
  it("formats positive change", () => {
    expect(formatPercentChange(110, 100)).toBe("+10.00%");
  });

  it("formats negative change", () => {
    expect(formatPercentChange(90, 100)).toBe("-10.00%");
  });

  it("returns N/A when previous is zero", () => {
    expect(formatPercentChange(100, 0)).toBe("N/A");
  });
});

describe("formatSupply", () => {
  it("formats trillions", () => {
    expect(formatSupply(1.5e12)).toBe("1.50T");
  });

  it("formats billions", () => {
    expect(formatSupply(2.3e9)).toBe("2.30B");
  });

  it("formats millions", () => {
    expect(formatSupply(45e6)).toBe("45.00M");
  });

  it("formats thousands", () => {
    expect(formatSupply(9500)).toBe("9.50K");
  });

  it("formats small values", () => {
    expect(formatSupply(42)).toBe("42");
  });

  it("handles NaN", () => {
    expect(formatSupply(NaN)).toBe("N/A");
  });

  it("handles Infinity", () => {
    expect(formatSupply(Infinity)).toBe("N/A");
  });
});

describe("formatAddress", () => {
  it("truncates long addresses", () => {
    expect(formatAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(
      "0x1234...5678"
    );
  });

  it("returns short addresses unchanged", () => {
    expect(formatAddress("0x1234")).toBe("0x1234");
  });
});

describe("formatEventDate", () => {
  it("formats unix timestamp to readable date", () => {
    // Jan 1, 2024 00:00:00 UTC
    const result = formatEventDate(1704067200);
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2024/);
  });
});

describe("formatDeathDate", () => {
  it("formats YYYY-MM to readable date", () => {
    expect(formatDeathDate("2023-05")).toBe("May 2023");
  });

  it("handles year-only input", () => {
    expect(formatDeathDate("2022")).toBe("2022");
  });
});

describe("formatDeathDateShort", () => {
  it("formats YYYY-MM to short date", () => {
    expect(formatDeathDateShort("2023-01")).toBe("Jan 23");
  });
});

describe("formatPegStability", () => {
  it("formats percentage", () => {
    expect(formatPegStability(99.85)).toBe("99.85%");
  });
});

describe("formatWorstDeviation", () => {
  it("formats positive deviation", () => {
    expect(formatWorstDeviation(500)).toBe("+500 bps");
  });

  it("formats negative deviation", () => {
    expect(formatWorstDeviation(-300)).toBe("-300 bps");
  });
});
