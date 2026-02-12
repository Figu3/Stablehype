"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlacklistEvent } from "@/lib/types";
import { API_BASE } from "@/lib/api";

interface BlacklistResponse {
  events: BlacklistEvent[];
  total: number;
}

async function fetchBlacklistEvents(): Promise<BlacklistResponse> {
  const res = await fetch(`${API_BASE}/api/blacklist`);
  if (!res.ok) throw new Error("Failed to fetch blacklist events");
  const json = await res.json();

  // Support both old (plain array) and new ({ events, total }) response format
  if (Array.isArray(json)) {
    return { events: json, total: json.length };
  }
  return json as BlacklistResponse;
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
