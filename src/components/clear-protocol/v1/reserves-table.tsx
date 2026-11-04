import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ClearV1Overview } from "@/hooks/use-clear-v1";
import { STALE, usd } from "./helpers";

export function ReservesTable({ overview }: { overview: ClearV1Overview }) {
  const reserves = overview.state?.reserves ?? [];
  const volume = new Map(overview.reserveVolume7d.map((v) => [v.address, v.volume]));
  const status = (r: (typeof reserves)[number]) =>
    r.paused ? "Paused" : r.paused === null || r.netPar === null ? STALE : r.rebalanceNeeded ? "Needs rebalance" : "Live";

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Reserves</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reserve</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead className="text-right">IOU debt</TableHead>
            <TableHead className="text-right">Share price</TableHead>
            <TableHead className="text-right">7D volume</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reserves.map((r) => {
            const price = r.netPar !== null && r.supply !== null && r.supply > 0 ? r.netPar / r.supply : null;
            return (
              <TableRow key={r.address}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right font-mono">{usd(r.netPar)}</TableCell>
                <TableCell className="text-right font-mono">{usd(r.iouDebtPar)}</TableCell>
                <TableCell className="text-right font-mono">{price === null ? STALE : price.toFixed(4)}</TableCell>
                <TableCell className="text-right font-mono">{usd(volume.get(r.address) ?? null)}</TableCell>
                <TableCell>{status(r)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
