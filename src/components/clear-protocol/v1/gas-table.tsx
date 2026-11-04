import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ClearV1Gas } from "@/hooks/use-clear-v1";
import { formatRunway } from "../format";

const NO_DATA = "-";
const eth = (v: number | null) => (v === null ? "unavailable" : `${v.toFixed(4)} ETH`);

export function GasTable({ gas }: { gas: ClearV1Gas }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Gas wallets</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Wallet</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">7D spend</TableHead>
            <TableHead className="text-right">7D txs</TableHead>
            <TableHead className="text-right">Runway</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {gas.wallets.map((w) => {
            const s7 = w.spend.find((s) => s.days === 7);
            return (
              <TableRow key={w.address}>
                <TableCell className="font-medium">{w.label}</TableCell>
                <TableCell className="text-right font-mono">{eth(w.balanceEth)}</TableCell>
                <TableCell className="text-right font-mono">{s7 ? eth(s7.eth) : NO_DATA}</TableCell>
                <TableCell className="text-right font-mono">
                  {s7?.txs ?? NO_DATA}
                  {s7 && s7.failed > 0 && <span className="text-amber-500"> ({s7.failed} failed)</span>}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {w.runwayDays === null ? NO_DATA : formatRunway(w.runwayDays)}
                  {w.runwayDaysAtP95Gas !== null && (
                    <span className="text-muted-foreground"> ({formatRunway(w.runwayDaysAtP95Gas)} at p95 gas)</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
