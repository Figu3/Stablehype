export function formatCurrency(value: number, decimals = 2): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(decimals)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(decimals)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(decimals)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(decimals)}K`;
  return `$${value.toFixed(decimals)}`;
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null || typeof price !== "number" || isNaN(price)) return "N/A";
  return `$${price.toFixed(4)}`;
}

/**
 * Compute peg deviation in basis points.
 * `pegValue` should be the USD price of one unit of the peg currency
 * (e.g. ~1.19 for EUR, ~1.30 for CHF, ~3200 for gold oz, 1 for USD).
 */
export function formatPegDeviation(price: number | null | undefined, pegValue = 1): string {
  if (price == null || typeof price !== "number" || isNaN(price)) return "N/A";
  if (pegValue === 0) return "N/A";
  // Deviation as basis points relative to peg: ((price / pegValue) - 1) * 10000
  const ratio = price / pegValue;
  const bps = Math.round((ratio - 1) * 10000);
  const sign = bps >= 0 ? "+" : "";
  return `${sign}${bps} bps`;
}

export function formatPercentChange(current: number, previous: number): string {
  if (previous === 0) return "N/A";
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

export function formatSupply(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(0);
}

export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatEventDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPegStability(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

export function formatWorstDeviation(bps: number): string {
  const sign = bps >= 0 ? "+" : "";
  return `${sign}${bps} bps`;
}
