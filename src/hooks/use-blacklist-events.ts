"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAllBlacklistEvents } from "@/lib/blacklist-fetcher";

export function useBlacklistEvents() {
  return useQuery({
    queryKey: ["blacklist-events"],
    queryFn: fetchAllBlacklistEvents,
    staleTime: 10 * 60 * 1000,      // 10 minutes
    refetchInterval: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  });
}
