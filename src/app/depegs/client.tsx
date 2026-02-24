"use client";

import { useMemo } from "react";
import { useDepegEvents } from "@/hooks/use-depeg-events";
import { useLogos } from "@/hooks/use-logos";
import { useClearMode } from "@/components/clear-mode-context";
import { CLEAR_ORACLE_IDS } from "@/lib/stablecoins";
import { DepegHistoryTabs } from "@/components/depeg-history-tabs";

export default function DepegsClient() {
  const { data: depegData, isLoading } = useDepegEvents();
  const { data: logos } = useLogos();
  const { clearMode } = useClearMode();

  const events = useMemo(() => {
    const all = depegData?.events ?? [];
    if (!clearMode) return all;
    return all.filter((e) => CLEAR_ORACLE_IDS.has(e.stablecoinId));
  }, [depegData, clearMode]);

  if (isLoading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <div className="h-10 w-10 rounded-full bg-frost-blue/30 animate-hype-pulse" />
      </div>
    );
  }

  return (
    <DepegHistoryTabs events={events} logos={logos} />
  );
}
