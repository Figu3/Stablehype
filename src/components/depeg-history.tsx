"use client";

import { useDepegEvents } from "@/hooks/use-depeg-events";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatEventDate, formatWorstDeviation } from "@/lib/format";
import { computePegStability } from "@/lib/peg-stability";
import type { DepegEvent } from "@/lib/types";

function formatDuration(startedAt: number, endedAt: number | null): string {
  if (!endedAt) return "Ongoing";
  const seconds = endedAt - startedAt;
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(seconds / 60)}m`;
}

function sortEvents(events: DepegEvent[]): DepegEvent[] {
  return [...events].sort((a, b) => {
    // Ongoing events first
    if (!a.endedAt && b.endedAt) return -1;
    if (a.endedAt && !b.endedAt) return 1;
    // Then by start date descending
    return b.startedAt - a.startedAt;
  });
}

export function DepegHistory({ stablecoinId, earliestTrackingDate }: { stablecoinId: string; earliestTrackingDate?: string | null }) {
  const { data, isLoading } = useDepegEvents(stablecoinId);

  if (isLoading) {
    return <Skeleton className="h-40" />;
  }

  const events = data?.events;
  if (!events || events.length === 0) return null;

  const sorted = sortEvents(events);
  const metrics = computePegStability(events, earliestTrackingDate ?? null);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-1">
        <CardTitle>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Depeg History
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {metrics && (
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Events </span>
              <span className="font-mono font-semibold">{metrics.eventCount}</span>
            </div>
            {metrics.worstDeviationBps !== null && (
              <div>
                <span className="text-muted-foreground">Worst Depeg </span>
                <span className={`font-mono font-semibold ${Math.abs(metrics.worstDeviationBps) >= 500 ? "text-red-500" : "text-amber-500"}`}>
                  {formatWorstDeviation(metrics.worstDeviationBps)}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Current Streak </span>
              {metrics.depeggedNow ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-red-500">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  Depegged now
                </span>
              ) : metrics.currentStreakDays !== null ? (
                <span className="font-mono font-semibold text-emerald-500">{metrics.currentStreakDays}d at peg</span>
              ) : (
                <span className="font-mono font-semibold text-muted-foreground">N/A</span>
              )}
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Peak Deviation</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Start Price</TableHead>
                <TableHead className="text-right">Peak Price</TableHead>
                <TableHead className="text-right">Recovery Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((event) => (
                <DepegRow key={event.id} event={event} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function DepegRow({ event }: { event: DepegEvent }) {
  const isOngoing = event.endedAt === null;
  const absBps = Math.abs(event.peakDeviationBps);
  const isSevere = absBps >= 500;
  const deviationColor = isSevere
    ? "text-red-500"
    : "text-amber-500";

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        {formatEventDate(event.startedAt)}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            event.direction === "below"
              ? "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400"
              : "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400"
          }
        >
          {event.direction === "below" ? "Below" : "Above"}
        </Badge>
      </TableCell>
      <TableCell className={`text-right font-mono ${deviationColor}`}>
        {event.peakDeviationBps > 0 ? "+" : ""}
        {event.peakDeviationBps} bps
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {isOngoing ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Ongoing
          </span>
        ) : (
          formatDuration(event.startedAt, event.endedAt)
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {formatPrice(event.startPrice)}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {event.peakPrice != null ? formatPrice(event.peakPrice) : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {event.recoveryPrice != null ? formatPrice(event.recoveryPrice) : "—"}
      </TableCell>
    </TableRow>
  );
}
