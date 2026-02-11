"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useBlacklistEvents } from "@/hooks/use-blacklist-events";
import { UsdsStatusCard } from "@/components/usds-status-card";
import { BlacklistStats } from "@/components/blacklist-stats";
import { DestroyChart } from "@/components/destroy-chart";
import { BlacklistFilters } from "@/components/blacklist-filters";
import { BlacklistTable } from "@/components/blacklist-table";
import { Button } from "@/components/ui/button";
import type { BlacklistStablecoin, BlacklistEventType } from "@/lib/types";

const PAGE_SIZE = 50;

export default function BlacklistPage() {
  const { data: events, isLoading, isError, error } = useBlacklistEvents();

  const [stablecoinFilter, setStablecoinFilter] = useState<BlacklistStablecoin | "all">("all");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<BlacklistEventType | "all">("all");
  const [page, setPage] = useState(1);

  // Reset page when filters change
  const handleStablecoinChange = (v: BlacklistStablecoin | "all") => { setStablecoinFilter(v); setPage(1); };
  const handleChainChange = (v: string) => { setChainFilter(v); setPage(1); };
  const handleEventTypeChange = (v: BlacklistEventType | "all") => { setEventTypeFilter(v); setPage(1); };

  const filtered = useMemo(() => {
    if (!events) return [];
    return events.filter((evt) => {
      if (stablecoinFilter !== "all" && evt.stablecoin !== stablecoinFilter) return false;
      if (chainFilter !== "all" && evt.chainId !== chainFilter) return false;
      if (eventTypeFilter !== "all" && evt.eventType !== eventTypeFilter) return false;
      return true;
    });
  }, [events, stablecoinFilter, chainFilter, eventTypeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Freeze & Blacklist Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Who got frozen. When. Why it matters.
        </p>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Signal lost. {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      <UsdsStatusCard />

      <BlacklistStats events={events} isLoading={isLoading} />

      <DestroyChart events={events} isLoading={isLoading} />

      <BlacklistFilters
        events={events}
        stablecoinFilter={stablecoinFilter}
        chainFilter={chainFilter}
        eventTypeFilter={eventTypeFilter}
        onStablecoinChange={handleStablecoinChange}
        onChainChange={handleChainChange}
        onEventTypeChange={handleEventTypeChange}
      />

      <BlacklistTable
        events={filtered}
        isLoading={isLoading}
        page={page}
        pageSize={PAGE_SIZE}
      />

      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-mono">{Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}</span>&ndash;<span className="font-mono">{Math.min(page * PAGE_SIZE, filtered.length)}</span> of <span className="font-mono">{filtered.length}</span> events
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
