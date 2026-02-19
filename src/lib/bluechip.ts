// Bluechip slug → Clear DefiLlama ID (only coins in both systems)
export const BLUECHIP_SLUG_MAP: Record<string, string> = {
  usdc: "2",
  usdt: "1",
  dai: "5",
  lusd: "8",
  bold: "269",
  pyusd: "120",
  gusd: "19",
  usdp: "11",
  eurc: "50",
  fdusd: "119",
  frax: "6",
  gho: "118",
  tusd: "7",
  rlusd: "250",
};

export const BLUECHIP_REPORT_BASE = "https://bluechip.org/en/coins";

// Higher = better, used for sort ordering
export const GRADE_ORDER: Record<string, number> = {
  "A+": 12, A: 11, "A-": 10,
  "B+": 9,  B: 8,  "B-": 7,
  "C+": 6,  C: 5,  "C-": 4,
  D: 3,     F: 1,
};
