import { Activity, Fuel, Zap } from "lucide-react";
import { formatAge, formatRunway } from "./format";

function MetricChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      {icon}
      <span className="font-mono text-xs text-foreground">{label}</span>
    </span>
  );
}

export function HealthBanner({
  isLoading,
  isHealthy,
  anyStale,
  openCount,
  totalRoutes,
  oracleAge,
  runwayDays,
}: {
  isLoading: boolean;
  isHealthy: boolean;
  anyStale: boolean;
  openCount: number;
  totalRoutes: number;
  oracleAge: number | null;
  runwayDays: number | null;
}) {
  if (isLoading) {
    return <div className="h-14 bg-muted/50 rounded-xl animate-pulse" />;
  }

  const statusColor = anyStale
    ? "border-amber-500/30 bg-amber-500/5"
    : isHealthy
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-red-500/30 bg-red-500/5";

  const dotColor = anyStale
    ? "bg-amber-400"
    : isHealthy
      ? "bg-emerald-500"
      : "bg-red-500";

  const statusLabel = anyStale
    ? "Oracle Stale"
    : isHealthy
      ? "Protocol Healthy"
      : "Depeg Active";

  const labelColor = anyStale
    ? "text-amber-700 dark:text-amber-400"
    : isHealthy
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-red-700 dark:text-red-400";

  return (
    <div className={`rounded-xl border ${statusColor} p-4`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${dotColor}`} />
          </span>
          <span className={`font-semibold ${labelColor}`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <MetricChip
            icon={<Activity className="h-3.5 w-3.5" />}
            label={`${openCount} / ${totalRoutes} routes open`}
          />
          <MetricChip
            icon={<Zap className="h-3.5 w-3.5" />}
            label={
              anyStale
                ? "Oracle stale"
                : oracleAge !== null
                  ? `Oracle live \u00b7 ${formatAge(oracleAge)}`
                  : "Oracle \u2014"
            }
          />
          {runwayDays !== null && (
            <MetricChip
              icon={<Fuel className="h-3.5 w-3.5" />}
              label={`Keeper: ${formatRunway(runwayDays)} runway`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
