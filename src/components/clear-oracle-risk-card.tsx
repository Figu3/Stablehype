"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ClearOracleDepType,
  ClearOracleRiskEntry,
} from "@shared/lib/clear-oracle-risk-types";

function scoreClass(score: number | null): string {
  if (score == null) return "border-border/60 bg-muted/30 text-muted-foreground";
  if (score >= 80) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (score >= 65) return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400";
  if (score >= 50) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  if (score >= 35) return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400";
  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400";
}

const DEP_TYPE_LABELS: Record<ClearOracleDepType, string> = {
  collateral: "Collateral",
  mechanism: "Mechanism",
  wrapper: "Wrapper",
  custody: "Custody",
};

export function ClearOracleRiskCard({
  entry,
  methodologyVersion,
  effectiveAt,
}: {
  entry: ClearOracleRiskEntry;
  methodologyVersion: string;
  effectiveAt: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Dependency risk</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Self-backed: {entry.selfBackedScore} · Grade {entry.grade}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`text-base font-semibold ${scoreClass(entry.score)}`}
        >
          {entry.score}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {entry.resolvedDeps.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No external upstream dependencies.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {entry.resolvedDeps.map((dep) => (
              <li
                key={`${dep.upstreamId}-${dep.label}`}
                className="flex items-start justify-between gap-3 rounded border border-border/60 bg-muted/20 p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{dep.label}</span>
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {DEP_TYPE_LABELS[dep.type]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(dep.weight * 100)}% weight
                    </span>
                  </div>
                  {dep.note && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{dep.note}</p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 font-mono text-xs ${scoreClass(dep.score)}`}
                >
                  {dep.score}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">{entry.detail}</p>

        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Methodology v{methodologyVersion}
          {effectiveAt ? ` · effective ${effectiveAt}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}
