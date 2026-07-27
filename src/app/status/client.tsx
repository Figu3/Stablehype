"use client";

import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHealth, type CacheStatus, type CronJobHealth } from "@/hooks/use-health";

const STATUS_META: Record<
  "healthy" | "degraded" | "stale",
  { label: string; cls: string; Icon: typeof CheckCircle2 }
> = {
  healthy: {
    label: "All systems healthy",
    cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    Icon: CheckCircle2,
  },
  degraded: {
    label: "Data degraded",
    cls: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    Icon: AlertTriangle,
  },
  stale: {
    label: "Data is stale",
    cls: "bg-red-500/10 text-red-500 border-red-500/20",
    Icon: AlertOctagon,
  },
};

const HEALTHY_CLS = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
const UNHEALTHY_CLS = "bg-red-500/10 text-red-500 border-red-500/20";

function humanizeDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 60) return `${Math.round(abs)}s`;
  const minutes = abs / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return `${Math.round(days)}d`;
}

function relativeFrom(unixSeconds: number | null, nowSeconds: number): string {
  if (unixSeconds == null) return "—";
  return `${humanizeDuration(Math.max(0, nowSeconds - unixSeconds))} ago`;
}

function HealthBadge({ healthy }: { healthy: boolean }) {
  return (
    <Badge variant="outline" className={healthy ? HEALTHY_CLS : UNHEALTHY_CLS}>
      {healthy ? "Healthy" : "Unhealthy"}
    </Badge>
  );
}

function CachesTable({ caches }: { caches: Record<string, CacheStatus> }) {
  const entries = Object.entries(caches);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Data Caches
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cache data reported.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cache</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Max age</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(([name, cache]) => (
                <TableRow key={name}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="font-mono tabular-nums text-muted-foreground">
                    {cache.ageSeconds != null ? `${humanizeDuration(cache.ageSeconds)} ago` : "—"}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-muted-foreground">
                    {humanizeDuration(cache.maxAge)}
                  </TableCell>
                  <TableCell>
                    <HealthBadge healthy={cache.healthy} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CronsTable({
  crons,
  nowSeconds,
}: {
  crons: Record<string, CronJobHealth>;
  nowSeconds: number;
}) {
  const entries = Object.entries(crons).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Background Jobs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cron job data reported.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Last success</TableHead>
                <TableHead>Last failure</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(([name, job]) => (
                <TableRow key={name}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="font-mono tabular-nums text-muted-foreground">
                    {relativeFrom(job.lastSuccess, nowSeconds)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-muted-foreground">
                    {relativeFrom(job.lastFailure, nowSeconds)}
                  </TableCell>
                  <TableCell>
                    <HealthBadge healthy={job.healthy} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function StatusSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export default function StatusClient() {
  const { data, isLoading, error } = useHealth();

  if (isLoading) {
    return <StatusSkeleton />;
  }

  if (error || !data) {
    return (
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Unable to load status data. The Worker API may be unreachable.
        </CardContent>
      </Card>
    );
  }

  const meta = STATUS_META[data.status];
  const Icon = meta.Icon;

  return (
    <div className="space-y-6">
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${meta.cls}`}
      >
        <Icon className="h-5 w-5 flex-shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider">{meta.label}</p>
          <p className="text-xs opacity-80">
            Last checked at{" "}
            {new Date(data.timestamp * 1000).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CachesTable caches={data.caches} />
        <CronsTable crons={data.crons} nowSeconds={data.timestamp} />
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          This page auto-refreshes every 2 minutes. Cache ages and job
          timestamps are relative to the Worker&apos;s last health check.
        </p>
        <p>
          Typical update cadences: prices &amp; supply every 15 minutes,
          DEX liquidity every 10 minutes, and USDS status, Bluechip
          ratings, oracle gas, and the market index every 15 minutes.
          Clear on-chain transaction syncs and chart history refresh every
          5 minutes; FX rates and log pruning run every 2 hours.
        </p>
      </div>
    </div>
  );
}
