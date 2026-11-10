"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClearV1Activity } from "@/hooks/use-clear-v1";
import { formatAge } from "../format";
import { useNowSeconds } from "./use-now";
import { v1ActorTag } from "@shared/lib/clear-v1-config";
import { ACTOR_TAG_CLASS, amount, shortAddr, tokenLabel } from "./helpers";

const FILTERS = [
  { label: "Flows", api: "swap,rebalance,flash_loan,deposit,withdraw,iou_mint,iou_redeem,pool_swap,pool_liquidity" },
  { label: "Swaps", api: "swap" },
  { label: "Rebalances", api: "rebalance" },
  { label: "Liquidity", api: "deposit,withdraw,pool_liquidity" },
  { label: "Admin", api: "admin" },
] as const;

const PAGE_SIZE = 10;

function ActorCell({ actor, txFrom }: { actor: string | null; txFrom: string | null }) {
  const tag = v1ActorTag(actor, txFrom);
  if (!actor && !tag) return <>-</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {tag && (
        <span className={`font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded ${ACTOR_TAG_CLASS[tag.kind]}`}>
          {tag.label}
        </span>
      )}
      {actor && <span className={tag ? "text-muted-foreground" : undefined}>{shortAddr(actor)}</span>}
    </span>
  );
}

export function ActivityFeed({ title = "Activity", actors }: { title?: string; actors?: readonly string[] }) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(PAGE_SIZE);
  const filter = FILTERS[index];
  const { data, isLoading, isError } = useClearV1Activity(filter.api, { actors });
  const events = data?.events ?? [];
  const now = useNowSeconds();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex gap-1">
          {FILTERS.map((f, i) => (
            <button
              key={f.label}
              type="button"
              onClick={() => { setIndex(i); setShown(PAGE_SIZE); }}
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
      ) : isError && !data ? (
        <p className="text-sm text-muted-foreground">Activity unavailable</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.slice(0, shown).map((e) => (
              <TableRow key={`${e.tx_hash}-${e.log_index}`}>
                <TableCell className="text-xs text-muted-foreground">{formatAge(now - e.timestamp)}</TableCell>
                <TableCell className="text-xs">{e.event_name}</TableCell>
                <TableCell className="text-xs">
                  {e.token_in || e.token_out ? `${tokenLabel(e.token_in, data?.tokens)} to ${tokenLabel(e.token_out, data?.tokens)}` : "-"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {e.volume_units === null ? "-" : amount(e.volume_units)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <ActorCell actor={e.actor} txFrom={e.tx_from} />
                </TableCell>
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
      {events.length > shown && (
        <button type="button" onClick={() => setShown(shown + PAGE_SIZE)}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground">
          Show more
        </button>
      )}
    </div>
  );
}
