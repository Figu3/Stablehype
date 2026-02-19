"use client";

import { useDepegEvents } from "@/hooks/use-depeg-events";
import { useLogos } from "@/hooks/use-logos";
import { DepegHistoryTabs } from "@/components/depeg-history-tabs";

export default function DepegsClient() {
  const { data: depegData, isLoading } = useDepegEvents();
  const { data: logos } = useLogos();

  if (isLoading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <div className="h-10 w-10 rounded-full bg-frost-blue/30 animate-hype-pulse" />
      </div>
    );
  }

  return (
    <DepegHistoryTabs events={depegData?.events ?? []} logos={logos} />
  );
}
