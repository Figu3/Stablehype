import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ClearV1Overview } from "@/hooks/use-clear-v1";
import { STALE, tokenLabel } from "./helpers";

/** Each reserve's own isRouteOpen answer, per direction, as of the last state read. */
export function RoutesTable({ overview }: { overview: ClearV1Overview }) {
  const routes = overview.state?.routes ?? [];
  const label = new Map((overview.state?.reserves ?? []).map((r) => [r.address, r.label]));
  const open = routes.filter((r) => r.open === true).length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold">Routes</h3>
        {routes.length > 0 && (
          <span className="text-xs text-muted-foreground">{open} of {routes.length} open</span>
        )}
      </div>
      {routes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No route reads yet: they arrive with the next state sync.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Reserve</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((r) => (
              <TableRow key={`${r.reserve}-${r.tokenIn}-${r.tokenOut}`}>
                <TableCell className="font-medium">
                  {tokenLabel(r.tokenIn, overview.tokens)} to {tokenLabel(r.tokenOut, overview.tokens)}
                </TableCell>
                <TableCell>{label.get(r.reserve) ?? r.reserve}</TableCell>
                <TableCell className="text-right">
                  {r.open === null ? (
                    <span className="text-muted-foreground">{STALE}</span>
                  ) : r.open ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />Open
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden />Closed
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
