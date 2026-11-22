"use client";

import { useState } from "react";
import type { OriginKind } from "@shared/lib/clear-v1-config";
import type { ClearV1Period } from "@/hooks/use-clear-v1";
import { money } from "./helpers";

// One fixed hue per category, checked with the dataviz validator on the light and dark cards
// (2026-11-22). Unlabeled is a hatched neutral on purpose: it is what is missing, not a series.
const COLOR: Record<OriginKind, string> = {
  bot: "#dc2626",
  integration: "#0284c7",
  discovered: "#d97706",
  direct: "#0d9488",
  team: "#7c3aed",
  other: "repeating-linear-gradient(135deg, var(--muted-foreground) 0 2px, transparent 2px 5px)",
};

const pct = (part: number, whole: number) => {
  if (whole === 0) return "0%";
  const p = (part / whole) * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
};

/**
 * Who the period's swaps came from, as a share of swap transactions: one bar split by origin,
 * and a legend that doubles as the table (share, count, volume). Unlabeled is what no rule in
 * v1SwapOrigin could name, so it should stay near zero.
 */
export function OriginSplit({ period, span }: { period: ClearV1Period | undefined; span: string }) {
  const [hover, setHover] = useState<OriginKind | null>(null);
  const origins = period?.origins;
  if (!origins) return null;
  const total = origins.reduce((n, o) => n + o.swaps, 0);
  const volume = origins.reduce((n, o) => n + o.volume, 0);
  const shown = origins.filter((o) => o.swaps > 0);
  const unlabeled = origins.find((o) => o.kind === "other")?.swaps ?? 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium text-muted-foreground">Who swapped, {span.toLowerCase()}</h3>
        <span className="text-xs text-muted-foreground">
          {total === 0 ? "No swaps" : (
            <>
              <span className="tabular-nums text-foreground">{pct(total - unlabeled, total)}</span> of {total} swap txs labeled
            </>
          )}
        </span>
      </div>

      {total > 0 && (
        <>
          <div className="flex h-3 w-full gap-[2px]" role="img"
            aria-label={shown.map((o) => `${o.label} ${pct(o.swaps, total)}`).join(", ")}>
            {shown.map((o) => (
              <div key={o.kind}
                onMouseEnter={() => setHover(o.kind)} onMouseLeave={() => setHover(null)}
                title={`${o.label}: ${o.swaps} swap txs (${pct(o.swaps, total)}), ${money(o.volume)} volume`}
                className={`h-full first:rounded-l last:rounded-r transition-opacity ${hover && hover !== o.kind ? "opacity-40" : ""}`}
                style={{ flexGrow: o.swaps, flexBasis: 0, minWidth: 3, background: COLOR[o.kind] }} />
            ))}
          </div>

          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
            {shown.map((o) => (
              <li key={o.kind}
                onMouseEnter={() => setHover(o.kind)} onMouseLeave={() => setHover(null)}
                className={`flex items-center gap-2 rounded px-1 -mx-1 ${hover === o.kind ? "bg-muted/50" : ""}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOR[o.kind] }} aria-hidden />
                <span className="text-muted-foreground">{o.label}</span>
                <span className="ml-auto tabular-nums font-medium text-foreground">{pct(o.swaps, total)}</span>
                <span className="w-28 shrink-0 whitespace-nowrap text-right tabular-nums text-muted-foreground">
                  {o.swaps} txs · {pct(o.volume, volume)} vol
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
