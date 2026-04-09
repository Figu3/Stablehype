"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CsiEntry, CsiWeights } from "@shared/lib/csi-types";

function scoreClass(score: number | null): string {
  if (score == null) return "border-border/60 bg-muted/30 text-muted-foreground";
  if (score >= 80) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (score >= 65) return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400";
  if (score >= 50) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  if (score >= 35) return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400";
  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400";
}

const COMPONENT_LABELS: { key: keyof CsiEntry["components"]; weightKey: keyof CsiWeights; label: string }[] = [
  { key: "pegScore", weightKey: "pegScore", label: "Peg stability" },
  { key: "dependencyRiskScore", weightKey: "dependencyRisk", label: "Dependency risk" },
  { key: "dexLiquidityScore", weightKey: "dexLiquidity", label: "DEX liquidity" },
  { key: "redemptionBackstopScore", weightKey: "redemptionBackstop", label: "Redemption" },
  { key: "bluechipScore", weightKey: "bluechip", label: "Bluechip" },
];

export function CsiCard({
  entry,
  weights,
  methodologyVersion,
  effectiveAt,
}: {
  entry: CsiEntry;
  weights: CsiWeights;
  methodologyVersion: string;
  effectiveAt: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Clear Stability Index</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Grade {entry.grade}
            {entry.missingComponents.length > 0 && (
              <> · {entry.missingComponents.length} component{entry.missingComponents.length > 1 ? "s" : ""} unavailable</>
            )}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`text-base font-semibold ${scoreClass(entry.score)}`}
        >
          {entry.score ?? "—"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
          {COMPONENT_LABELS.map(({ key, weightKey, label }) => {
            const value = entry.components[key];
            const weight = weights[weightKey];
            const isMissing = value == null;
            return (
              <div
                key={key}
                className={`rounded border p-2 ${isMissing ? "border-border/40 bg-muted/10 opacity-50" : "border-border/60 bg-muted/20"}`}
              >
                <div className="text-muted-foreground">
                  {label}
                  <span className="ml-1 text-[10px] opacity-60">
                    {Math.round(weight * 100)}%
                  </span>
                </div>
                <div className={`mt-0.5 font-mono text-sm ${isMissing ? "text-muted-foreground" : ""}`}>
                  {value ?? "—"}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Methodology v{methodologyVersion}
          {effectiveAt ? ` · effective ${effectiveAt}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}
