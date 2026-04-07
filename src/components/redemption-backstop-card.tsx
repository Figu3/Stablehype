"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import {
  REDEMPTION_ACCESS_LABELS,
  REDEMPTION_EXECUTION_LABELS,
  REDEMPTION_OUTPUT_ASSET_LABELS,
  REDEMPTION_ROUTE_FAMILY_LABELS,
  REDEMPTION_SETTLEMENT_LABELS,
} from "@shared/lib/redemption-backstop-scoring";
import type { RedemptionBackstopEntry } from "@shared/lib/redemption-types";

function scoreClass(score: number | null): string {
  if (score == null) return "border-border/60 bg-muted/30 text-muted-foreground";
  if (score >= 80) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (score >= 65) return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400";
  if (score >= 50) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  if (score >= 35) return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400";
  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400";
}

function scoreText(score: number | null): string {
  if (score == null) return "—";
  return String(score);
}

export function RedemptionBackstopCard({ entry }: { entry: RedemptionBackstopEntry }) {
  const subScores: { label: string; value: number | null }[] = [
    { label: "Access", value: entry.accessScore },
    { label: "Settlement", value: entry.settlementScore },
    { label: "Execution", value: entry.executionCertaintyScore },
    { label: "Capacity", value: entry.capacityScore },
    { label: "Output asset", value: entry.outputAssetQualityScore },
    { label: "Cost", value: entry.costScore },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Redemption backstop</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {REDEMPTION_ROUTE_FAMILY_LABELS[entry.routeFamily]} ·{" "}
            <span className="lowercase">{entry.modelConfidence} confidence</span>
          </p>
        </div>
        <Badge variant="outline" className={`text-base font-semibold ${scoreClass(entry.score)}`}>
          {scoreText(entry.score)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          {subScores.map((s) => (
            <div key={s.label} className="rounded border border-border/60 bg-muted/20 p-2">
              <div className="text-muted-foreground">{s.label}</div>
              <div className="mt-0.5 font-mono text-sm">{scoreText(s.value)}</div>
            </div>
          ))}
        </div>

        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Access model</dt>
            <dd>{REDEMPTION_ACCESS_LABELS[entry.accessModel]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Settlement</dt>
            <dd>{REDEMPTION_SETTLEMENT_LABELS[entry.settlementModel]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Execution</dt>
            <dd>{REDEMPTION_EXECUTION_LABELS[entry.executionModel]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Output asset</dt>
            <dd>{REDEMPTION_OUTPUT_ASSET_LABELS[entry.outputAssetType]}</dd>
          </div>
          {entry.immediateCapacityUsd != null && (
            <div>
              <dt className="text-muted-foreground">Immediate capacity</dt>
              <dd>{formatCurrency(entry.immediateCapacityUsd)}</dd>
            </div>
          )}
          {entry.feeBps != null && (
            <div>
              <dt className="text-muted-foreground">Fee</dt>
              <dd>{entry.feeBps} bps</dd>
            </div>
          )}
        </dl>

        {entry.notes && entry.notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {entry.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        {entry.docs?.sources && entry.docs.sources.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {entry.docs.sources.map((src) => (
              <a
                key={`${src.label}-${src.url}`}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border/60 bg-muted/20 px-2 py-1 hover:bg-muted/40"
              >
                {src.label} ↗
              </a>
            ))}
          </div>
        )}

        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Methodology v{entry.methodologyVersion} · source: {entry.sourceMode}
          {entry.docs?.reviewedAt ? ` · reviewed ${entry.docs.reviewedAt}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}
