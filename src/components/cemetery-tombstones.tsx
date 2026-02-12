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

// --- Shape variety ---

type TombShape = "arch" | "hammer" | "cross";

function getTombShape(cause: CauseOfDeath): TombShape {
  if (cause === "regulatory") return "hammer";
  if (cause === "abandoned") return "cross";
  return "arch";
}

// Hammer smashing down onto the tombstone — head strikes the arch, handle extends to lower-right
function HammerStrike({ size }: { size: TombSize }) {
  const s = size === "lg" ? 80 : size === "md" ? 68 : 58;
  return (
    <div
      className="absolute z-20 pointer-events-none overflow-visible"
      style={{ top: -20, left: "50%", transform: "translateX(-30%)" }}
    >
      <svg
        width={s}
        height={s}
        viewBox="0 0 80 80"
        fill="none"
        style={{ transform: "rotate(40deg)", transformOrigin: "24px 20px" }}
        aria-hidden="true"
      >
        {/* Handle — extends from head down-right */}
        <rect x="21" y="22" width="4.5" height="55" rx="2.2" fill="#9a7b4f" />
        <rect x="22" y="22" width="2" height="55" rx="1" fill="#b8956a" opacity="0.5" />

        {/* Head — claw hammer */}
        <path
          d="M6 10 L6 28 L14 28 L16 23 L28 23 L30 28 L38 28 L38 10Z"
          fill="#374151"
        />
        {/* Claw notch */}
        <path
          d="M6 10 L10 16 L6 16Z"
          fill="#1f2937"
        />
        {/* Face highlight */}
        <rect x="30" y="12" width="6" height="14" rx="1" fill="#4b5563" opacity="0.6" />
        {/* Top edge bevel */}
        <rect x="8" y="10" width="28" height="3" rx="1" fill="#4b5563" opacity="0.4" />
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
          relative
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
        {/* Hammer smashing into tombstone for regulatory kills */}
        {shape === "hammer" && <HammerStrike size={size} />}

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
