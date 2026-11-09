import type { ClearV1Overview, ClearV1SpotRoute } from "@/hooks/use-clear-v1";
import { STALE, tokenLabel } from "./helpers";

type Hop = ClearV1SpotRoute["hops"][number];

/** Short name of the step: a Meta swap is named by its reserve, Base steps by what they do. */
function hopName(h: Hop, reserveLabel: (a: string) => string): string {
  if (h.via === "deposit") return "Base entry";
  if (h.via === "withdraw") return "Base exit";
  return reserveLabel(h.reserve) === "Base LP" ? "Base swap" : reserveLabel(h.reserve);
}

function RoutePill({ route, tokens, reserveLabel }: {
  route: ClearV1SpotRoute;
  tokens: ClearV1Overview["tokens"];
  reserveLabel: (a: string) => string;
}) {
  const blocker = route.hops.find((h) => h.open === false);
  const tone =
    route.open === true
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
      : "border-border text-muted-foreground";
  const dot = route.open === true ? "bg-emerald-500" : "bg-muted-foreground/40";
  const status = route.open === null ? STALE : route.open ? "open" : `${hopName(blocker!, reserveLabel)} shut`;
  const path = route.hops
    .map((h) => `${hopName(h, reserveLabel)}: ${tokenLabel(h.tokenIn, tokens)} to ${tokenLabel(h.tokenOut, tokens)} (${h.open === null ? "unknown" : h.open ? "open" : "shut"})`)
    .join(", then ");
  return (
    <li title={path} className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm ${tone}`}>
      <span className="flex items-center gap-2 min-w-0">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="truncate">to {tokenLabel(route.tokenOut, tokens)}</span>
      </span>
      <span className="text-xs shrink-0">{status}</span>
    </li>
  );
}

/**
 * Stablecoin-to-stablecoin routes, one card per source token. A route is open when every step
 * is: the reserves' own isRouteOpen, and Base's single-asset entry or exit where the route
 * passes through bLP. A shut route names its first shut step.
 */
export function RoutesGrid({ overview }: { overview: ClearV1Overview }) {
  const routes = overview.state?.spotRoutes ?? [];
  const labels = new Map((overview.state?.reserves ?? []).map((r) => [r.address, r.label]));
  const reserveLabel = (a: string) => labels.get(a) ?? a;
  const open = routes.filter((r) => r.open === true).length;
  const sources = [...new Set(routes.map((r) => r.tokenIn))];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold">Routes</h3>
        {routes.length > 0 && (
          <span className="text-xs text-muted-foreground">{open} of {routes.length} open</span>
        )}
      </div>
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No route reads yet: they arrive with the next state sync.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sources.map((src) => {
            const rs = routes.filter((r) => r.tokenIn === src);
            return (
              <div key={src} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">From {tokenLabel(src, overview.tokens)}</span>
                  <span className="text-xs text-muted-foreground">
                    {rs.filter((r) => r.open === true).length}/{rs.length}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {rs.map((r) => (
                    <RoutePill key={r.tokenOut} route={r} tokens={overview.tokens} reserveLabel={reserveLabel} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
