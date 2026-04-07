"use client";

import { useMemo } from "react";
import { AlertTriangle, AlertOctagon } from "lucide-react";
import { useHealth } from "@/hooks/use-health";

/**
 * Surfaces stale data and failing cron jobs to users.
 *
 * Renders nothing when status === "healthy" or query is loading.
 * Polls /api/health every 2 minutes via useHealth().
 */
export function DataHealthBanner() {
  const { data, isLoading } = useHealth();

  const issues = useMemo(() => {
    if (!data || data.status === "healthy") return null;

    const messages: string[] = [];

    // Stale caches
    for (const [key, cache] of Object.entries(data.caches)) {
      if (!cache.healthy && cache.ageSeconds != null) {
        const minutesOld = Math.round(cache.ageSeconds / 60);
        messages.push(`${key} cache is ${minutesOld}m old (max ${Math.round(cache.maxAge / 60)}m)`);
      }
    }

    // Failing cron jobs
    for (const [job, health] of Object.entries(data.crons)) {
      if (!health.healthy) {
        const lastFail = health.lastFailure
          ? new Date(health.lastFailure * 1000).toLocaleString()
          : "unknown";
        messages.push(`cron "${job}" last failed at ${lastFail}`);
      }
    }

    return messages.length > 0 ? messages : null;
  }, [data]);

  if (isLoading || !data || data.status === "healthy" || !issues) return null;

  const isStale = data.status === "stale";
  const Icon = isStale ? AlertOctagon : AlertTriangle;
  const colorClasses = isStale
    ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const label = isStale ? "Data is stale" : "Data degraded";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b ${colorClasses}`}
    >
      <div className="mx-auto flex max-w-screen-2xl items-start gap-3 px-4 py-2 text-xs sm:text-sm">
        <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 space-y-0.5">
          <p className="font-semibold uppercase tracking-wider">{label}</p>
          <ul className="space-y-0.5 text-xs opacity-90">
            {issues.slice(0, 3).map((msg) => (
              <li key={msg}>• {msg}</li>
            ))}
            {issues.length > 3 && (
              <li className="opacity-70">+ {issues.length - 3} more</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
