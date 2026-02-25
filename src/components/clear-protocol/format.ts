import { ORACLE_DECIMALS } from "@/lib/clear-contracts";

export function formatOraclePrice(raw: bigint): string {
  const divisor = BigInt(10) ** BigInt(ORACLE_DECIMALS);
  const whole = raw / divisor;
  const frac = (raw < BigInt(0) ? -raw : raw) % divisor;
  const fracStr = frac.toString().padStart(ORACLE_DECIMALS, "0").slice(0, 4);
  return `$${whole}.${fracStr}`;
}

export function formatBps(bps: bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

export function formatAge(seconds: number): string {
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(4)}`;
}

export function formatRunway(days: number): string {
  const d = Math.floor(days);
  const h = Math.floor((days - d) * 24);
  return `${d}d ${h}h`;
}
