import type { ClearV1SpotLeg, ClearV1State } from "@/hooks/use-clear-v1";

export interface StepState {
  open: boolean | null;
  label: string;
}

type Basket = ClearV1State["basket"];
type Feeds = ClearV1State["feeds"];

/**
 * Why one side of a stablecoin is open or shut, in plain words. A Meta's depeg route only opens when
 * its input trades below its redemption price, so "At peg" is the normal state of a native, not a fault.
 * Base single-asset entry and exit need the whole basket within proximityBps of its redemption price.
 */
export function stepState(leg: ClearV1SpotLeg, side: "enter" | "exit", feeds: Feeds, basket: Basket): StepState {
  const open = leg[side].open;
  if (open === true) return { open, label: "Open" };
  if (open === null) return { open, label: "Unknown" };
  if (leg.kind === "base") return { open, label: "Basket off peg" };
  if (side === "enter") {
    const f = feeds.find((x) => x.asset === leg.token);
    if (f?.price == null || f.redemptionPrice == null) return { open, label: "Shut" };
    return { open, label: f.price >= f.redemptionPrice ? "At peg" : "Spread out of range" };
  }
  if (!basket) return { open, label: "Shut" };
  return { open, label: basket.price >= basket.redemptionPrice ? "bLP at peg" : "Spread out of range" };
}

/** One line on Base's gate when it shuts any single-asset entry or exit, else null. */
export function basketReason(legs: ClearV1SpotLeg[], basket: Basket): string | null {
  const shut = legs.some((l) => l.kind === "base" && (l.enter.open === false || l.exit.open === false));
  if (!shut) return null;
  if (!basket || basket.proximityBps === null || basket.offBps <= basket.proximityBps) {
    return "USDC and USDT entry and exit to bLP are shut.";
  }
  return `USDC and USDT entry and exit to bLP are paused: the Base basket is ${basket.offBps.toFixed(1)} bps from its redemption price (limit ${basket.proximityBps} bps).`;
}
