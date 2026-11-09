import type { ClearV1Overview } from "@/hooks/use-clear-v1";
import { STALE, tokenLabel } from "./helpers";

type Route = NonNullable<NonNullable<ClearV1Overview["state"]>["routes"]>[number];

function RoutePill({ route, tokens }: { route: Route; tokens: ClearV1Overview["tokens"] }) {
  const text = `${tokenLabel(route.tokenIn, tokens)} to ${tokenLabel(route.tokenOut, tokens)}`;
  const tone =
    route.open === true
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
      : "border-border text-muted-foreground";
  const dot = route.open === true ? "bg-emerald-500" : "bg-muted-foreground/40";
  const state = route.open === null ? STALE : route.open ? "open" : "closed";
  return (
    <li className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm ${tone}`}>
      <span className="flex items-center gap-2 min-w-0">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="truncate">{text}</span>
      </span>
      <span className="text-xs shrink-0">{state}</span>
    </li>
  );
}

/** Each reserve's own isRouteOpen answer, per direction, as of the last state read. */
export function RoutesGrid({ overview }: { overview: ClearV1Overview }) {
  const routes = overview.state?.routes ?? [];
  const reserves = overview.state?.reserves ?? [];
  const open = routes.filter((r) => r.open === true).length;
  const cards = reserves
    .map((r) => ({ reserve: r, routes: routes.filter((x) => x.reserve === r.address) }))
    .filter((c) => c.routes.length > 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold">Routes</h3>
        {routes.length > 0 && (
          <span className="text-xs text-muted-foreground">{open} of {routes.length} open</span>
        )}
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No route reads yet: they arrive with the next state sync.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {cards.map(({ reserve, routes: rs }) => (
            <div key={reserve.address} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold truncate">{reserve.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {rs.filter((r) => r.open === true).length}/{rs.length}
                </span>
              </div>
              <ul className="space-y-1.5">
                {rs.map((r) => <RoutePill key={`${r.tokenIn}-${r.tokenOut}`} route={r} tokens={overview.tokens} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
