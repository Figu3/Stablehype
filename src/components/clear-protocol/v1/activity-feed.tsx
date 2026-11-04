"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClearV1Activity } from "@/hooks/use-clear-v1";
import { formatAge } from "../format";
import { useNowSeconds } from "./use-now";
import { amount, shortAddr, tokenLabel } from "./helpers";

// Liquidity spans several event kinds, so it is filtered here instead of by the API.
const LIQUIDITY_KINDS = new Set(["deposit", "withdraw", "pool_liquidity"]);

const FILTERS = [
  { label: "All", api: null },
  { label: "Swaps", api: "swap" },
  { label: "Rebalances", api: "rebalance" },
  { label: "Liquidity", api: null, local: LIQUIDITY_KINDS },
  { label: "Admin", api: "admin" },
] as const;

export function ActivityFeed() {
  const [index, setIndex] = useState(0);
  const filter = FILTERS[index];
  const { data, isLoading, isError } = useClearV1Activity(filter.api);
  const local = "local" in filter ? filter.local : null;
  const events = (data?.events ?? []).filter((e) => !local || local.has(e.kind));
  const now = useNowSeconds();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Activity</h3>
        <div className="flex gap-1">
          {FILTERS.map((f, i) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setIndex(i)}
              className={`px-2 py-0.5 rounded text-xs ${
                i === index ? "bg-violet-500/20 text-violet-300" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="h-24 bg-muted/50 rounded animate-pulse" />
      ) : isError ? (
        <p className="text-sm text-muted-foreground">Activity unavailable</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={`${e.tx_hash}-${e.log_index}`}>
                <TableCell className="text-xs text-muted-foreground">{formatAge(now - e.timestamp)}</TableCell>
                <TableCell>{e.kind}</TableCell>
                <TableCell className="text-xs">{e.event_name}</TableCell>
                <TableCell className="text-xs">
                  {e.token_in || e.token_out ? `${tokenLabel(e.token_in)} to ${tokenLabel(e.token_out)}` : "-"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {e.volume_units === null ? "-" : amount(e.volume_units)}
                </TableCell>
                <TableCell className="font-mono text-xs">{e.actor ? shortAddr(e.actor) : "-"}</TableCell>
                <TableCell>
                  <a
                    href={`https://etherscan.io/tx/${e.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View on Etherscan"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
