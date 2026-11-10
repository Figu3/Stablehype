"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ClearV1State } from "@/hooks/use-clear-v1";
import { formatAge } from "../format";
import { feedAge, feedStale } from "./helpers";

export function OracleFeeds({ state }: { state: ClearV1State }) {
  return (
    <div>
      <h2 className="text-base font-semibold mb-2">Oracle feeds</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Age when read</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {state.feeds.map((f) => {
            const age = feedAge(f, state.updatedAt);
            const stale = feedStale(f, state.updatedAt);
            return (
              <TableRow key={f.asset}>
                <TableCell className="font-medium">{f.symbol}</TableCell>
                <TableCell className="text-right font-mono">{f.price === null ? "unavailable" : `$${f.price.toFixed(4)}`}</TableCell>
                <TableCell className={`text-right ${stale ? "text-amber-500" : ""}`}>
                  {age === null ? "unavailable" : formatAge(age)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
