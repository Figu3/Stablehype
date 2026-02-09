"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlacklistEvent } from "@/lib/types";
import { API_BASE } from "@/lib/api";

async function fetchBlacklistEvents(): Promise<BlacklistEvent[]> {
  const res = await fetch(`${API_BASE}/api/blacklist`);
  if (!res.ok) throw new Error("Failed to fetch blacklist events");
  return res.json();
}

export function useBlacklistEvents() {
  return useQuery({
    queryKey: ["blacklist-events"],
    queryFn: fetchBlacklistEvents,
    staleTime: 10 * 60 * 1000,      // 10 minutes
    refetchInterval: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  });
}
