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

const CROSS_SIZE = {
  lg: { vw: 5, vh: 22, hw: 16, hh: 5, top: -20 },
  md: { vw: 4, vh: 18, hw: 14, hh: 4, top: -16 },
  sm: { vw: 4, vh: 16, hw: 12, hh: 4, top: -14 },
} as const;

const HAMMER_SIZE = {
  lg: { w: 24, h: 24, top: -22 },
  md: { w: 20, h: 20, top: -18 },
  sm: { w: 18, h: 18, top: -16 },
} as const;

// --- Shape variety ---

type TombShape = "arch" | "hammer" | "cross";

function getTombShape(cause: CauseOfDeath): TombShape {
  if (cause === "regulatory") return "hammer";
  if (cause === "abandoned") return "cross";
  return "arch";
}

function HammerIcon({ size, brightness }: { size: TombSize; brightness: number }) {
  const cfg = HAMMER_SIZE[size];
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-0 pointer-events-none"
      style={{ top: cfg.top }}
    >
      <svg
        width={cfg.w}
        height={cfg.h}
        viewBox="0 0 24 24"
        fill="none"
        className="text-blue-400/70 dark:text-blue-400/60"
        style={{ filter: `brightness(${brightness})` }}
        aria-hidden="true"
      >
        {/* Handle */}
        <rect x="11" y="10" width="2" height="14" rx="1" fill="currentColor" opacity="0.7" />
        {/* Head */}
        <rect x="4" y="2" width="16" height="8" rx="2" fill="currentColor" />
      </svg>
    </div>
  );
}

// --- Weathering by age ---

function getDeathAgeYears(deathDate: string): number {
  const [year, month] = deathDate.split("-").map(Number);
  const deathMs = new Date(year, (month || 1) - 1).getTime();
  const nowMs = Date.now();
  return (nowMs - deathMs) / (365.25 * 24 * 60 * 60 * 1000);
}

function getWeathering(deathDate: string): { brightness: number; mossIntensity: number } {
  const age = getDeathAgeYears(deathDate);
  const brightness = Math.max(0.85, 1.0 - (age / 8) * 0.15);
  const mossIntensity = age < 3 ? 0 : Math.min(0.12, ((age - 3) / 5) * 0.12);
  return { brightness, mossIntensity };
}

// --- Grass tufts ---

function GrassTuft({ variant }: { variant: number }) {
  const v = variant % 3;
  return (
    <svg
      className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-emerald-700/50 dark:text-emerald-600/40"
      width="40"
      height="12"
      viewBox="0 0 40 12"
      fill="currentColor"
      aria-hidden="true"
    >
      {v === 0 && (
        <>
          <path d="M10 12 Q10 4, 7 0 Q12 3, 14 12Z" />
          <path d="M20 12 Q20 3, 17 0 Q22 4, 24 12Z" />
          <path d="M28 12 Q28 5, 25 1 Q30 4, 32 12Z" />
        </>
      )}
      {v === 1 && (
        <>
          <path d="M7 12 Q7 5, 4 1 Q9 4, 11 12Z" />
          <path d="M15 12 Q15 3, 12 0 Q17 4, 19 12Z" />
          <path d="M23 12 Q23 4, 20 0 Q25 3, 27 12Z" />
          <path d="M31 12 Q31 5, 28 1 Q33 4, 35 12Z" />
        </>
      )}
      {v === 2 && (
        <>
          <path d="M6 12 Q6 4, 3 0 Q8 3, 10 12Z" />
          <path d="M13 12 Q13 5, 10 1 Q15 4, 17 12Z" />
          <path d="M20 12 Q20 3, 17 0 Q22 4, 24 12Z" />
          <path d="M27 12 Q27 4, 24 0 Q29 3, 31 12Z" />
          <path d="M33 12 Q33 5, 30 1 Q35 4, 37 12Z" />
        </>
      )}
    </svg>
  );
}

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
  const staggerLevel = index % 3;
  const staggerClass = staggerLevel === 0 ? "mt-0" : staggerLevel === 1 ? "mt-3" : "mt-6";
  const rotation = (index % 3 - 1) * 0.5;

  const shape = getTombShape(coin.causeOfDeath);
  const topRounding = cfg.arch;

  // Weathering
  const { brightness, mossIntensity } = getWeathering(coin.deathDate);
  const mossShadow = mossIntensity > 0
    ? `inset 0 -6px 12px rgba(34,120,60,${mossIntensity})`
    : "";

  const buildBoxShadow = () => {
    const parts = ["inset 0 2px 4px rgba(0,0,0,0.15)"];
    if (mossShadow) parts.push(mossShadow);
    if (hovered) parts.push(`0 0 16px ${color}33`);
    return parts.join(", ");
  };

  // Cross dimensions
  const cross = CROSS_SIZE[size];

  return (
    <div
      className={`relative flex flex-col items-center ${staggerClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(coin.symbol)}
    >
      {/* Hammer for regulatory tombstones */}
      {shape === "hammer" && (
        <HammerIcon size={size} brightness={brightness} />
      )}

      {/* Cross top for abandoned tombstones */}
      {shape === "cross" && (
        <div
          className="absolute z-0 pointer-events-none"
          style={{ top: cross.top }}
        >
          {/* Vertical bar */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bg-stone-100 dark:bg-[hsl(220,15%,18%)] border border-border"
            style={{ width: cross.vw, height: cross.vh, filter: `brightness(${brightness})` }}
          />
          {/* Horizontal bar */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bg-stone-100 dark:bg-[hsl(220,15%,18%)] border border-border"
            style={{
              width: cross.hw,
              height: cross.hh,
              top: 2,
              filter: `brightness(${brightness})`,
            }}
          />
        </div>
      )}

      <div
        className={`
          ${cfg.w} ${cfg.h} ${topRounding}
          bg-stone-100 dark:bg-[hsl(220,15%,18%)]
          border border-border
          flex flex-col items-center justify-center gap-1.5
          cursor-pointer transition-all duration-200
          hover:-translate-y-1
        `}
        style={{
          borderTopWidth: "3px",
          borderTopColor: color,
          boxShadow: buildBoxShadow(),
          filter: `brightness(${brightness})`,
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

      {/* Grass tuft at base */}
      <GrassTuft variant={index} />

      {/* Tooltip */}
      {hovered && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-30 w-56 rounded-lg border bg-popover p-3 text-xs shadow-lg pointer-events-none">
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
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          The Cemetery
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pb-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-x-3 gap-y-6 justify-items-center pt-16 pb-4">
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
