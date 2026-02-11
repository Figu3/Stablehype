"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StablecoinLogo } from "@/components/stablecoin-logo";
import { formatCurrency, formatPrice, formatPegDeviation } from "@/lib/format";
import { getPegReference } from "@/lib/peg-rates";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import type { StablecoinData } from "@/lib/types";

interface MarketHighlightsProps {
  data: StablecoinData[] | undefined;
  logos?: Record<string, string>;
  pegRates?: Record<string, number>;
}

function getCirculating(c: StablecoinData): number {
  if (!c.circulating) return 0;
  return Object.values(c.circulating).reduce((s, v) => s + (v ?? 0), 0);
}

function getPrevWeek(c: StablecoinData): number {
  if (!c.circulatingPrevWeek) return 0;
  return Object.values(c.circulatingPrevWeek).reduce((s, v) => s + (v ?? 0), 0);
}

// --- Biggest Depegs ---

function BiggestDepegs({
  data,
  logos,
  pegRates = {},
}: MarketHighlightsProps) {
  const depegs = useMemo(() => {
    if (!data) return [];

    const metaById = new Map(TRACKED_STABLECOINS.map((s) => [s.id, s]));
    const entries: {
      id: string;
      symbol: string;
      name: string;
      price: number;
      bps: number;
      pegRef: number;
    }[] = [];

    for (const coin of data) {
      const meta = metaById.get(coin.id);
      if (!meta) continue;
      // Skip NAV tokens — their price deviates from peg by design (yield accrual)
      if (meta.flags.navToken) continue;
      if (coin.price == null || typeof coin.price !== "number" || isNaN(coin.price)) continue;
      const supply = getCirculating(coin);
      if (supply < 1_000_000) continue;

      const pegRef = getPegReference(coin.pegType, pegRates, meta.goldOunces);
      if (pegRef === 0) continue;
      const bps = Math.round(((coin.price / pegRef) - 1) * 10000);

      entries.push({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        price: coin.price,
        bps,
        pegRef,
      });
    }

    entries.sort((a, b) => Math.abs(b.bps) - Math.abs(a.bps));
    return entries.slice(0, 5);
  }, [data, pegRates]);

  return (
    <Card className="rounded-2xl border-l-[3px] border-l-red-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Biggest Depegs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {depegs.length === 0 && (
          <p className="text-xs text-muted-foreground">No data</p>
        )}
        {depegs.map((d) => (
          <Link
            key={d.id}
            href={`/stablecoin/${d.id}`}
            className="flex items-center justify-between gap-2 group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <StablecoinLogo
                src={logos?.[d.id]}
                name={d.name}
                size={20}
              />
              <span className="text-sm font-medium truncate group-hover:underline">
                {d.symbol}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground font-mono">
                {formatPrice(d.price)}
              </span>
              <span
                className={`text-xs font-mono font-semibold ${
                  Math.abs(d.bps) >= 50
                    ? "text-red-500"
                    : Math.abs(d.bps) >= 10
                      ? "text-amber-500"
                      : "text-muted-foreground"
                }`}
              >
                {formatPegDeviation(d.price, d.pegRef)}
              </span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

// --- Fastest Movers ---

function FastestMovers({
  data,
  logos,
}: MarketHighlightsProps) {
  const { growers, shrinkers } = useMemo(() => {
    if (!data) return { growers: [], shrinkers: [] };

    const metaIds = new Set(TRACKED_STABLECOINS.map((s) => s.id));
    const entries: {
      id: string;
      symbol: string;
      name: string;
      pctChange: number;
    }[] = [];

    for (const coin of data) {
      if (!metaIds.has(coin.id)) continue;
      const current = getCirculating(coin);
      const prev = getPrevWeek(coin);
      if (current < 1_000_000 || prev < 1_000_000) continue;

      const pctChange = ((current - prev) / prev) * 100;
      entries.push({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        pctChange,
      });
    }

    const sorted = [...entries].sort((a, b) => b.pctChange - a.pctChange);
    return {
      growers: sorted.slice(0, 3),
      shrinkers: sorted.slice(-3).reverse().filter((e) => e.pctChange < 0),
    };
  }, [data]);

  return (
    <Card className="rounded-2xl border-l-[3px] border-l-emerald-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Fastest Movers <span className="normal-case font-normal text-muted-foreground">(7d)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4">
          {/* Growing */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Growing</p>
            {growers.map((g) => (
              <Link
                key={g.id}
                href={`/stablecoin/${g.id}`}
                className="flex items-center justify-between gap-1 group"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <StablecoinLogo
                    src={logos?.[g.id]}
                    name={g.name}
                    size={18}
                  />
                  <span className="text-sm font-medium truncate group-hover:underline">
                    {g.symbol}
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-500 flex-shrink-0">
                  +{g.pctChange.toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
          {/* Shrinking */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">Shrinking</p>
            {shrinkers.length === 0 && (
              <p className="text-xs text-muted-foreground">None</p>
            )}
            {shrinkers.map((s) => (
              <Link
                key={s.id}
                href={`/stablecoin/${s.id}`}
                className="flex items-center justify-between gap-1 group"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <StablecoinLogo
                    src={logos?.[s.id]}
                    name={s.name}
                    size={18}
                  />
                  <span className="text-sm font-medium truncate group-hover:underline">
                    {s.symbol}
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold text-red-500 flex-shrink-0">
                  {s.pctChange.toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Dominance Bar ---

function DominanceBar({ data }: MarketHighlightsProps) {
  const stats = useMemo(() => {
    if (!data) return null;

    const metaIds = new Set(TRACKED_STABLECOINS.map((s) => s.id));
    let usdt = 0;
    let usdc = 0;
    let rest = 0;

    for (const coin of data) {
      if (!metaIds.has(coin.id)) continue;
      const mcap = getCirculating(coin);
      if (coin.id === "1") usdt = mcap;
      else if (coin.id === "2") usdc = mcap;
      else rest += mcap;
    }

    const total = usdt + usdc + rest;
    if (total === 0) return null;

    return {
      usdt,
      usdc,
      rest,
      total,
      usdtPct: (usdt / total) * 100,
      usdcPct: (usdc / total) * 100,
      restPct: (rest / total) * 100,
    };
  }, [data]);

  if (!stats) return null;

  const segments = [
    { label: "USDT", mcap: stats.usdt, pct: stats.usdtPct, bg: "bg-blue-500", text: "text-blue-500" },
    { label: "USDC", mcap: stats.usdc, pct: stats.usdcPct, bg: "bg-sky-400", text: "text-sky-400" },
    { label: "Others", mcap: stats.rest, pct: stats.restPct, bg: "bg-zinc-500", text: "text-zinc-500" },
  ];

  return (
    <Card className="rounded-2xl border-l-[3px] border-l-sky-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Dominance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
          {segments.map((s) => (
            <div
              key={s.label}
              className={`h-full ${s.bg}`}
              style={{ width: `${s.pct}%` }}
            />
          ))}
        </div>

        <div className="space-y-2 pt-1">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${s.bg}`} />
                <span className={`font-medium ${s.text}`}>{s.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-bold font-mono">{s.pct.toFixed(1)}%</span>
                <span className="text-muted-foreground text-xs font-mono">{formatCurrency(s.mcap)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Combined export ---

export function MarketHighlights({ data, logos, pegRates }: MarketHighlightsProps) {
  if (!data) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <BiggestDepegs data={data} logos={logos} pegRates={pegRates} />
      <FastestMovers data={data} logos={logos} />
      <DominanceBar data={data} />
    </div>
  );
}
