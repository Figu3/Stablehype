import type { ClearV1Overview } from "@/hooks/use-clear-v1";
import { tokenLabel } from "./helpers";
import { baseGateReason, stepState, type StepState } from "./route-states";

function Step({ s }: { s: StepState }) {
  const tone = s.open === true ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-muted-foreground";
  const dot = s.open === true ? "bg-emerald-500" : "bg-muted-foreground/40";
  return (
    <span className={`inline-flex items-center gap-1.5 ${tone}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

/**
 * Stablecoin-to-stablecoin routes. A route is open when its source can be sold into Clear and its
 * destination bought out of it: one table row per stablecoin says which, and why not. USDC and USDT
 * also swap directly on Base. "Open" means the depeg route: a shut Meta step can still fill at
 * redemption price through the baseline swap, which no aggregator would pick.
 */
export function RoutesPanel({ overview }: { overview: ClearV1Overview }) {
  const state = overview.state;
  const legs = state?.spotLegs ?? [];
  const routes = state?.spotRoutes ?? [];
  const tokens = overview.tokens;
  const name = (a: string) => tokenLabel(a, tokens);

  if (!state || legs.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2">Routes</h3>
        <p className="text-sm text-muted-foreground">No route reads yet: they arrive with the next state sync.</p>
      </div>
    );
  }

  const openNow = routes.filter((r) => r.open === true);
  const direct = routes.filter((r) => r.hops.length === 1);
  const reason = baseGateReason(legs, state.feeds, state.basket?.proximityBps ?? null, name);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Routes</h3>
        <span className="text-xs text-muted-foreground">{openNow.length} of {routes.length} open</span>
      </div>

      <p className="text-sm">
        <span className="text-muted-foreground">Open now: </span>
        {openNow.length === 0
          ? <span className="text-muted-foreground">no routes</span>
          : <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {openNow.map((r) => `${name(r.tokenIn)} to ${name(r.tokenOut)}`).join(", ")}
            </span>}
      </p>

      {reason && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {reason}
        </p>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Stablecoin</th>
              <th className="text-left font-medium px-3 py-2">Sell into Clear</th>
              <th className="text-left font-medium px-3 py-2">Buy out of Clear</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((l) => (
              <tr key={l.token} className="border-t">
                <td className="px-3 py-2 font-medium">{name(l.token)}</td>
                <td className="px-3 py-2"><Step s={stepState(l, "enter", state.feeds)} /></td>
                <td className="px-3 py-2"><Step s={stepState(l, "exit", state.feeds)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {direct.length > 0 && (
        <p className="text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-muted-foreground">Direct on Base:</span>
          {direct.map((r) => (
            <span key={`${r.tokenIn}-${r.tokenOut}`} className="inline-flex items-center gap-1.5">
              {name(r.tokenIn)} to {name(r.tokenOut)}
              <Step s={{ open: r.open, label: r.open === true ? "Open" : r.open === null ? "Unknown" : "Shut" }} />
            </span>
          ))}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        A route is open when its source can be sold into Clear and its destination bought out. Open means
        Clear&apos;s depeg route; a shut Meta step can still fill at redemption price through the baseline swap.
      </p>
    </div>
  );
}
