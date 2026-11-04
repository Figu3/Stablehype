import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ClearV1Overview } from "@/hooks/use-clear-v1";
import { amount, shortAddr, tokenLabel, usd } from "./helpers";

export function PoolsTable({ overview }: { overview: ClearV1Overview }) {
  const [showAll, setShowAll] = useState(false);
  const allPools = overview.state?.pools ?? [];
  const volume = new Map(overview.poolVolume7d.map((v) => [v.address, v.volume]));
  // Most pools only hold seed liquidity, so they stay folded until someone trades them.
  const isActive = (p: (typeof allPools)[number]) =>
    (volume.get(p.address) ?? 0) > 0 || p.adminBalances.some((b) => b === null || b > 0);
  const pools = showAll ? allPools : allPools.filter(isActive);
  const quiet = allPools.length - allPools.filter(isActive).length;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Curve pools</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pool</TableHead>
            <TableHead className="text-right">Balances</TableHead>
            <TableHead className="text-right">7D volume</TableHead>
            <TableHead className="text-right">Pending admin fees</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pools.map((p) => {
            const pending = p.adminBalances.some((b) => b === null)
              ? null
              : p.adminBalances.reduce<number>((a, b) => a + (b ?? 0), 0);
            return (
              <TableRow key={p.address}>
                <TableCell className="font-medium">{p.label}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {p.balances.map((b, i) => `${amount(b)} ${tokenLabel(p.coins[i])}`).join(" / ")}
                </TableCell>
                <TableCell className="text-right font-mono">{usd(volume.get(p.address) ?? null)}</TableCell>
                <TableCell className="text-right font-mono">{usd(pending)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {quiet > 0 && (
        <button type="button" onClick={() => setShowAll(!showAll)}
          className="text-xs text-muted-foreground hover:text-foreground">
          {showAll ? "Hide quiet pools" : `Show ${quiet} quiet ${quiet === 1 ? "pool" : "pools"}`}
        </button>
      )}
      {overview.entryPoints.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Entry points, 7D
          </h4>
          <ul className="text-xs space-y-0.5">
            {overview.entryPoints.map((e) => (
              <li key={e.entry} className="flex gap-3">
                <span className="font-mono">{shortAddr(e.entry)}</span>
                <span className="text-muted-foreground">{e.swaps} {e.swaps === 1 ? "swap" : "swaps"}</span>
                <span className="font-mono ml-auto">{usd(e.volume)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
