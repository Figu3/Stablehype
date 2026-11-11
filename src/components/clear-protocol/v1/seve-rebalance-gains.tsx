"use client";

import { ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSeveRebalances } from "@/hooks/use-seve";
import { formatAge, formatUSD } from "../format";
import { useNowSeconds } from "./use-now";
import { amount, tokenLabel } from "./helpers";

const ROWS = 10;
const bps = (v: number | null) => (v == null ? "-" : `${v.toFixed(2)} bps`);
const usd = (v: number | null) => (v == null ? "-" : `${v < 0 ? "-" : ""}${formatUSD(Math.abs(v))}`);

/**
 * Sève's gain on each Clear V1 rebalance. `rebalanceSwap` prices both legs at their redemption price,
 * so Sève receives more units of the over-weight asset than it supplies. Gross is that surplus; net
 * takes off the issuer's redemption cost, which is an assumption.
 */
export function SeveRebalanceTable() {
  const { data, isError } = useSeveRebalances();
  const now = useNowSeconds();
  if (isError && !data) return <p className="text-sm text-muted-foreground">Rebalance gains unavailable</p>;
  if (!data || data.rows.length === 0) return <p className="text-sm text-muted-foreground">No rebalance yet</p>;
  return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.slice(0, ROWS).map((r) => (
              <TableRow key={`${r.txHash}-${r.tokenIn}-${r.amountIn}`}>
                <TableCell className="text-xs text-muted-foreground">{formatAge(now - r.timestamp)}</TableCell>
                <TableCell className="text-xs">{`${tokenLabel(r.tokenIn, data.tokens)} to ${tokenLabel(r.tokenOut, data.tokens)}`}</TableCell>
                <TableCell className="text-right font-mono">{amount(r.amountIn)}</TableCell>
                <TableCell className="text-right font-mono">{amount(r.amountOut)}</TableCell>
                <TableCell className="text-right font-mono">{r.grossUsd == null ? "-" : `${usd(r.grossUsd)} · ${bps(r.grossBps)}`}</TableCell>
                <TableCell className="text-right font-mono">{r.netUsd == null ? "-" : `${usd(r.netUsd)} · ${bps(r.netBps)}`}</TableCell>
                <TableCell>
                  <a href={`https://etherscan.io/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer" aria-label="View on Etherscan" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
  );
}
