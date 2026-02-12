"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEAD_STABLECOINS, CAUSE_META } from "@/lib/dead-stablecoins";
import { formatCurrency } from "@/lib/format";
import type { DeadStablecoin, CauseOfDeath } from "@/lib/types";

const CAUSE_HEX: Record<CauseOfDeath, string> = {
  "algorithmic-failure": "#ef4444",
  "counterparty-failure": "#f59e0b",
  "liquidity-drain": "#f97316",
  regulatory: "#3b82f6",
  abandoned: "#71717a",
};

function shortDate(d: string): string {
  const [year, month] = d.split("-");
  if (!month) return year;
  const dt = new Date(Number(year), Number(month) - 1);
  return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

type TombSize = "lg" | "md" | "sm";

function getTombSize(peakMcap?: number): TombSize {
  if (!peakMcap) return "sm";
  if (peakMcap >= 1_000_000_000) return "lg";
  if (peakMcap >= 50_000_000) return "md";
  return "sm";
}

const SIZE = {
  lg: { w: "w-[120px]", h: "h-[180px]", arch: "rounded-t-[60px]", logo: 36 },
  md: { w: "w-[100px]", h: "h-[160px]", arch: "rounded-t-[50px]", logo: 32 },
  sm: { w: "w-[88px]", h: "h-[140px]", arch: "rounded-t-[44px]", logo: 28 },
} as const;

function Tombstone({
  coin,
  index,
  onSelect,
}: {
  coin: DeadStablecoin;
  index: number;
  onSelect: (symbol: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const size = getTombSize(coin.peakMcap);
  const cfg = SIZE[size];
  const color = CAUSE_HEX[coin.causeOfDeath];
  const logoUrl = coin.logo ? `/logos/cemetery/${coin.logo}` : undefined;
  const stagger = index % 2 === 1;
  const rotation = (index % 3 - 1) * 0.5;

  return (
    <div
      className={`relative flex flex-col items-center ${stagger ? "mt-4" : "mt-0"}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(coin.symbol)}
    >
      <div
        className={`
          ${cfg.w} ${cfg.h} ${cfg.arch}
          bg-card border border-border/50
          flex flex-col items-center justify-center gap-1.5
          cursor-pointer transition-all duration-200
          hover:-translate-y-1
        `}
        style={{
          borderTopWidth: "3px",
          borderTopColor: color,
          boxShadow: hovered ? `0 0 16px ${color}33` : "none",
          transform: hovered
            ? "translateY(-4px) rotate(0deg)"
            : `rotate(${rotation}deg)`,
        }}
      >
        <span className="text-[8px] text-muted-foreground/30 tracking-widest">
          R.I.P.
        </span>

        <div
          className="rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0"
          style={{ width: cfg.logo, height: cfg.logo }}
        >
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={coin.symbol}
              width={cfg.logo}
              height={cfg.logo}
              className={`rounded-full transition-all duration-300 ${hovered ? "" : "grayscale"}`}
              unoptimized
            />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">
              {coin.symbol.charAt(0)}
            </span>
          )}
        </div>

        <span className="text-xs font-semibold line-through decoration-muted-foreground/50 text-center leading-tight">
          {coin.symbol}
        </span>

        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          {shortDate(coin.deathDate)}
        </span>

        {coin.peakMcap && (
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60">
            {formatCurrency(coin.peakMcap, 1)}
          </span>
        )}
      </div>

      {/* Tooltip */}
      {hovered && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-30 w-56 rounded-lg border bg-popover p-3 text-xs shadow-lg pointer-events-none">
          <p className="font-semibold">{coin.name}</p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            {coin.obituary.split(". ")[0]}.
          </p>
          <div className="mt-1.5 flex items-center justify-between">
            <span className={CAUSE_META[coin.causeOfDeath].color.split(" ")[0]}>
              {CAUSE_META[coin.causeOfDeath].label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CemeteryTombstones() {
  const handleSelect = useCallback((symbol: string) => {
    const el = document.getElementById(`obituary-${symbol}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/50");
      setTimeout(
        () => el.classList.remove("ring-2", "ring-primary/50"),
        2000
      );
    }
  }, []);

  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          The Cemetery
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pb-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-x-3 gap-y-2 justify-items-center pb-4">
            {DEAD_STABLECOINS.map((coin, i) => (
              <Tombstone
                key={coin.symbol}
                coin={coin}
                index={i}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {/* Ground gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-emerald-950/15 dark:from-emerald-950/25 to-transparent pointer-events-none" />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 pt-3 border-t mt-2">
          {Object.entries(CAUSE_META).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: CAUSE_HEX[key as CauseOfDeath] }}
              />
              <span className="text-xs text-muted-foreground">
                {meta.label}
              </span>
            </div>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground/50 italic">
            Tombstone size reflects peak market cap
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
