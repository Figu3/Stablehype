"use client";

import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketIndex } from "@/hooks/use-market-index";

const BAND_STYLES: Record<string, string> = {
  glassy: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  steady: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  choppy: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  rough: "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  stormy: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
  meltdown: "border-red-700/30 bg-red-700/15 text-red-800 dark:text-red-300",
};

const SCORE_TEXT: Record<string, string> = {
  glassy: "text-emerald-700 dark:text-emerald-400",
  steady: "text-blue-700 dark:text-blue-400",
  choppy: "text-amber-700 dark:text-amber-400",
  rough: "text-orange-700 dark:text-orange-400",
  stormy: "text-red-700 dark:text-red-400",
  meltdown: "text-red-800 dark:text-red-300",
};

function ComponentBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{value ?? "—"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        {value != null && (
          <div
            className="h-full rounded-full bg-frost-blue transition-all"
            style={{ width: `${Math.max(2, value)}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function MarketIndexCard() {
  const { data, isLoading, error } = useMarketIndex();

  if (error) return null; // non-essential hero — degrade silently
  if (isLoading || !data) {
    return <Skeleton className="h-44 rounded-2xl" />;
  }

  const { index, history } = data;
  const bandCls = BAND_STYLES[index.bandKey] ?? BAND_STYLES.steady;
  const scoreCls = SCORE_TEXT[index.bandKey] ?? SCORE_TEXT.steady;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Market Stability Index
          </CardTitle>
          <Link
            href="/methodology/market-index/"
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Methodology
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className={`text-5xl font-bold font-mono tabular-nums ${scoreCls}`}>
              {index.score}
            </span>
            <div className="space-y-1">
              <Badge variant="outline" className={bandCls}>
                {index.bandLabel}
              </Badge>
              <p className="text-xs text-muted-foreground">
                {index.activeDepegCount} active depeg{index.activeDepegCount === 1 ? "" : "s"} ·{" "}
                {index.stressedCount} stressed · {index.coinsConsidered} coins
              </p>
            </div>
          </div>

          {history.length >= 2 && (
            <div className="h-14 w-full sm:w-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="smiGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--frost-blue)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--frost-blue)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="var(--frost-blue)"
                    strokeWidth={1.5}
                    fill="url(#smiGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:w-64">
            <ComponentBar label="Peg deviation" value={index.components.deviationScore} />
            <ComponentBar label="Depeg breadth" value={index.components.depegBreadthScore} />
            <ComponentBar label="Stress breadth" value={index.components.stressBreadthScore} />
            <ComponentBar label="Mcap trend" value={index.components.mcapTrendScore} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
