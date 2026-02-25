import { useMemo } from "react";
import { Circle } from "lucide-react";
import type { ClearTokenPrice, ClearRoute } from "@/hooks/use-clear-routes";
import { formatBps } from "./format";

export function RouteMatrix({
  routes,
  tokens,
  depegThresholdBps,
}: {
  routes: ClearRoute[];
  tokens: ClearTokenPrice[];
  depegThresholdBps: bigint;
}) {
  const symbols = tokens.map((t) => t.symbol);
  const routeMap = useMemo(() => {
    const map = new Map<string, ClearRoute>();
    for (const r of routes) {
      map.set(`${r.from}\u2192${r.to}`, r);
    }
    return map;
  }, [routes]);

  const openCount = routes.filter((r) => r.open).length;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="text-xs text-muted-foreground">
        <span className="font-mono text-foreground">{openCount}</span> / {routes.length} open
        {" \u00b7 "}Depeg threshold: <span className="font-mono text-foreground">{formatBps(depegThresholdBps)}</span>
      </div>
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr>
            <th className="text-left text-muted-foreground font-medium p-1.5 w-12">&darr;/&rarr;</th>
            {symbols.map((s) => (
              <th key={s} className="text-center font-medium p-1.5 w-10">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((from) => (
            <tr key={from} className="border-t border-border/30">
              <td className="font-medium p-1.5 text-muted-foreground">{from}</td>
              {symbols.map((to) => {
                if (from === to) {
                  return <td key={to} className="text-center p-1.5 text-muted-foreground/20">&mdash;</td>;
                }
                const route = routeMap.get(`${from}\u2192${to}`);
                const isStale = route?.reason?.includes("stale");
                return (
                  <td key={to} className="text-center p-1.5">
                    <span title={route?.reason ?? `${from} \u2192 ${to}`}>
                      <Circle
                        className={`inline h-2.5 w-2.5 ${
                          route?.open
                            ? "fill-emerald-500 text-emerald-500"
                            : isStale
                              ? "fill-amber-500/40 text-amber-500/40"
                              : "fill-muted-foreground/25 text-muted-foreground/25"
                        }`}
                      />
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
        <span className="inline-flex items-center gap-1">
          <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" /> Open
        </span>
        <span className="inline-flex items-center gap-1">
          <Circle className="h-2 w-2 fill-muted-foreground/25 text-muted-foreground/25" /> Closed
        </span>
        <span className="inline-flex items-center gap-1">
          <Circle className="h-2 w-2 fill-amber-500/40 text-amber-500/40" /> Stale
        </span>
      </div>
    </div>
  );
}
