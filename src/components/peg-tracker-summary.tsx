"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePegSummary } from "@/hooks/use-peg-summary";

export function PegTrackerSummary() {
  const { data, isLoading } = usePegSummary();
  const summary = data?.summary;

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-l-[3px] border-l-blue-500">
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-l-[3px] border-l-blue-500">
      <CardHeader className="pb-2">
        <CardTitle as="h2" className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Activity className="h-4 w-4" />Peg Tracker</span>
          <Link
            href="/peg-tracker"
            className="text-xs font-normal text-muted-foreground hover:text-foreground transition-colors"
          >
            View tracker &rarr;
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold font-mono">{summary?.coinsAtPeg ?? 0}</p>
            <p className="text-xs text-muted-foreground">coins at peg</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{summary?.activeDepegCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">active depegs</p>
          </div>
          <div>
            {summary?.worstCurrent ? (
              <>
                <p className="text-2xl font-bold font-mono text-red-500">
                  {summary.worstCurrent.bps > 0 ? "+" : ""}{summary.worstCurrent.bps} bps
                </p>
                <p className="text-xs text-muted-foreground">worst: {summary.worstCurrent.symbol}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold font-mono text-emerald-500">0 bps</p>
                <p className="text-xs text-muted-foreground">median deviation</p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
