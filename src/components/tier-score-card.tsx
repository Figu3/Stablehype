"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TierBadge } from "@/components/tier-badge";
import { getStablecoinTier, getStablecoinTierScore, TIER_META } from "@/lib/tiers";

interface TierScoreCardProps {
  stablecoinId: string;
}

const SCORE_COLORS = [
  { min: 3, bar: "bg-emerald-500", text: "text-emerald-500" },
  { min: 2, bar: "bg-blue-500", text: "text-blue-500" },
  { min: 1, bar: "bg-amber-500", text: "text-amber-500" },
  { min: 0, bar: "bg-red-500", text: "text-red-500" },
];

function scoreColor(score: number): { bar: string; text: string } {
  for (const c of SCORE_COLORS) {
    if (score >= c.min) return c;
  }
  return SCORE_COLORS[SCORE_COLORS.length - 1];
}

export function TierScoreCard({ stablecoinId }: TierScoreCardProps) {
  const tier = getStablecoinTier(stablecoinId);
  const tierScore = getStablecoinTierScore(stablecoinId);

  // Don't render if no tier assignment at all
  if (!tier) return null;

  const meta = TIER_META[tier];

  return (
    <Card className={`rounded-2xl border-l-[3px] ${meta.borderClass}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Internal Tier
          </CardTitle>
          <TierBadge tier={tier} size="md" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tier label + description */}
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold font-mono ${meta.textClass}`}>
            {tier}
          </span>
          <div>
            <p className="text-sm font-semibold">{meta.label}</p>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </div>
        </div>

        {/* Composite score */}
        {tierScore?.score != null && (
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Composite Score:</span>
            <span className={`text-lg font-bold font-mono ${meta.textClass}`}>
              {tierScore.score.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">/3.00</span>
          </div>
        )}

        {/* 8-dimension score breakdown */}
        {tierScore?.dimensions && tierScore.dimensions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Scoring Dimensions
            </p>
            {tierScore.dimensions.map((dim) => {
              const { bar, text } = scoreColor(dim.score);
              const widthPct = (dim.score / 3) * 100;
              return (
                <div key={dim.label} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-muted-foreground shrink-0 truncate" title={dim.label}>
                    {dim.shortLabel}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${bar}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className={`w-6 text-right font-mono tabular-nums font-bold ${text}`}>
                    {dim.score}
                  </span>
                  {dim.weight > 0 && (
                    <span className="w-10 text-right text-muted-foreground/60 font-mono">
                      {dim.weight}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Override reason if present */}
        {tierScore?.overrideReason && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2.5">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Manual Override</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{tierScore.overrideReason}</p>
          </div>
        )}

        {/* If tier assigned but no detailed scoring */}
        {!tierScore && (
          <p className="text-xs text-muted-foreground italic">
            Tier assigned via classification rules. Detailed scoring pending.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
