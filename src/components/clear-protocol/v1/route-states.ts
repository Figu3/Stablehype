import type { ClearV1SpotLeg, ClearV1State } from "@/hooks/use-clear-v1";

export interface StepState {
  open: boolean | null;
  label: string;
}

type Feeds = ClearV1State["feeds"];

/** Distance of an asset's oracle price below or above its redemption price, in bps (absolute). */
export function offBps(feeds: Feeds, asset: string): number | null {
  const f = feeds.find((x) => x.asset === asset);
  if (f?.price == null || f.redemptionPrice == null || f.redemptionPrice === 0) return null;
  return (Math.abs(f.price - f.redemptionPrice) / f.redemptionPrice) * 1e4;
}

/**
 * Why one side of a stablecoin is open or shut, in plain words. A Meta's depeg route only opens when
 * its input trades below its redemption price, so "At peg" is the normal state of a native, not a fault.
 * A native's exit needs bLP below its redemption price; how the Meta prices bLP is not read, so a
 * shut exit is just "Shut". Base single-asset entry and exit need every Base asset near its redemption price.
 */
export function stepState(leg: ClearV1SpotLeg, side: "enter" | "exit", feeds: Feeds): StepState {
  const open = leg[side].open;
  if (open === true) return { open, label: "Open" };
  if (open === null) return { open, label: "Unknown" };
  if (leg.kind === "base") return { open, label: "Base gate shut" };
  if (side === "exit") return { open, label: "Shut" };
  const f = feeds.find((x) => x.asset === leg.token);
  if (f?.price == null || f.redemptionPrice == null) return { open, label: "Shut" };
  return { open, label: f.price >= f.redemptionPrice ? "At peg" : "Spread out of range" };
}

/**
 * One line on Base's gate when it shuts any single-asset entry or exit, else null. The gate
 * (OffRedemptionPrice) reverts when any Base asset's oracle price is more than redemptionProximityBps
 * from its redemption price, as read on 2026-11-09: USDT 3.3 bps off shut USDC's entry too.
 */
export function baseGateReason(legs: ClearV1SpotLeg[], feeds: Feeds, proximityBps: number | null,
  name: (a: string) => string): string | null {
  const base = legs.filter((l) => l.kind === "base");
  if (!base.some((l) => l.enter.open === false || l.exit.open === false)) return null;
  const lead = "USDC and USDT entry and exit to bLP are shut";
  if (proximityBps === null) return `${lead}.`;
  const off = base
    .map((l) => ({ token: l.token, bps: offBps(feeds, l.token) }))
    .filter((x): x is { token: string; bps: number } => x.bps !== null && x.bps > proximityBps);
  if (off.length === 0) return `${lead}.`;
  const list = off.map((x) => `${name(x.token)} is ${x.bps.toFixed(1)} bps from its redemption price`).join(", ");
  return `${lead}: ${list} (limit ${proximityBps} bps).`;
}
