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
  lg: { w: "w-[120px]", h: "h-[180px]", arch: "rounded-t-[60px]", slab: "rounded-t-lg", logo: 36 },
  md: { w: "w-[100px]", h: "h-[160px]", arch: "rounded-t-[50px]", slab: "rounded-t-lg", logo: 32 },
  sm: { w: "w-[88px]", h: "h-[140px]", arch: "rounded-t-[44px]", slab: "rounded-t-lg", logo: 28 },
} as const;

const CROSS_SIZE = {
  lg: { vw: 4, vh: 16, hw: 12, hh: 4, top: -14 },
  md: { vw: 3, vh: 14, hw: 10, hh: 3, top: -12 },
  sm: { vw: 3, vh: 12, hw: 9, hh: 3, top: -10 },
} as const;

// --- Feature 4: Shape variety ---

type TombShape = "arch" | "slab" | "cross";

function getTombShape(cause: CauseOfDeath): TombShape {
  if (cause === "regulatory") return "slab";
  if (cause === "abandoned") return "cross";
  return "arch";
}

// --- Feature 5: Weathering by age ---

function getDeathAgeYears(deathDate: string): number {
  const [year, month] = deathDate.split("-").map(Number);
  const deathMs = new Date(year, (month || 1) - 1).getTime();
  const nowMs = Date.now();
  return (nowMs - deathMs) / (365.25 * 24 * 60 * 60 * 1000);
}

function getWeathering(deathDate: string): { brightness: number; mossIntensity: number } {
  const age = getDeathAgeYears(deathDate);
  // 8-year range: 0 years → brightness 1.0, 8+ years → 0.85
  const brightness = Math.max(0.85, 1.0 - (age / 8) * 0.15);
  // Moss appears after 3 years, maxes out at 8 years
  const mossIntensity = age < 3 ? 0 : Math.min(0.12, ((age - 3) / 5) * 0.12);
  return { brightness, mossIntensity };
}

// --- Feature 6: Candle eligibility ---

function isRecentDeath(deathDate: string, monthsThreshold = 6): boolean {
  const [year, month] = deathDate.split("-").map(Number);
  const deathMs = new Date(year, (month || 1) - 1).getTime();
  const thresholdMs = Date.now() - monthsThreshold * 30.44 * 24 * 60 * 60 * 1000;
  return deathMs >= thresholdMs;
}

// --- Feature 3: Grass tufts ---

function GrassTuft({ variant }: { variant: number }) {
  const v = variant % 3;
  return (
    <svg
      className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-emerald-800/30 dark:text-emerald-900/40"
      width="28"
      height="8"
      viewBox="0 0 28 8"
      fill="currentColor"
      aria-hidden="true"
    >
      {v === 0 && (
        <>
          <path d="M8 8 Q8 3, 6 0 Q9 2, 10 8Z" />
          <path d="M14 8 Q14 2, 12 0 Q15 3, 16 8Z" />
          <path d="M20 8 Q20 4, 18 1 Q21 3, 22 8Z" />
        </>
      )}
      {v === 1 && (
        <>
          <path d="M6 8 Q6 4, 4 1 Q7 3, 8 8Z" />
          <path d="M11 8 Q11 2, 9 0 Q12 3, 13 8Z" />
          <path d="M16 8 Q16 3, 14 0 Q17 2, 18 8Z" />
          <path d="M22 8 Q22 4, 20 1 Q23 3, 24 8Z" />
        </>
      )}
      {v === 2 && (
        <>
          <path d="M5 8 Q5 3, 3 0 Q6 2, 7 8Z" />
          <path d="M9 8 Q9 4, 7 1 Q10 3, 11 8Z" />
          <path d="M14 8 Q14 2, 12 0 Q15 3, 16 8Z" />
          <path d="M19 8 Q19 3, 17 0 Q20 2, 21 8Z" />
          <path d="M23 8 Q23 4, 21 1 Q24 3, 25 8Z" />
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
  const staggerLevel = index % 3; // 0, 1, or 2
  const staggerClass = staggerLevel === 0 ? "mt-0" : staggerLevel === 1 ? "mt-3" : "mt-6";
  const rotation = (index % 3 - 1) * 0.5;

  const shape = getTombShape(coin.causeOfDeath);
  const topRounding = shape === "slab" ? cfg.slab : cfg.arch;

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

  // Candle
  const showCandle = isRecentDeath(coin.deathDate);

  // Cross dimensions
  const cross = CROSS_SIZE[size];

  return (
    <div
      className={`relative flex flex-col items-center ${staggerClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(coin.symbol)}
    >
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

      {/* Flickering candle for recent deaths */}
      {showCandle && (
        <div
          className="absolute -bottom-2.5 left-[60%] pointer-events-none"
          style={{ animationDelay: `${(index * 0.3) % 2}s` }}
        >
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-amber-400/15 blur-[3px] animate-candle-flicker"
              style={{ animationDelay: `${(index * 0.3) % 2}s` }}
            />
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-candle-flicker"
              style={{ animationDelay: `${(index * 0.3) % 2}s` }}
            />
          </div>
        </div>
      )}

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
        <div className="relative pb-8 overflow-hidden">
          {/* Moon + glow (top-right) */}
          <div className="absolute top-4 right-6 pointer-events-none z-0">
            <div className="absolute -inset-4 rounded-full bg-yellow-200/20 blur-xl animate-pharos-pulse" />
            <div
              className="w-8 h-8 rounded-full"
              style={{
                boxShadow: "-6px 2px 0 0 oklch(0.92 0.08 90)",
                background: "transparent",
              }}
            />
          </div>

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

          {/* Fog layers */}
          <div className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none z-10 overflow-hidden">
            <div className="absolute inset-0 w-[150%] left-[-25%] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-fog-1" />
            <div className="absolute inset-0 w-[150%] left-[-25%] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-fog-2" style={{ top: "20%" }} />
            <div className="absolute inset-0 w-[150%] left-[-25%] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent animate-fog-3" style={{ top: "40%" }} />
          </div>

          {/* Ground gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-emerald-950/15 dark:from-emerald-950/25 to-transparent pointer-events-none z-[11]" />
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
