"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

interface UsdsStatus {
  freezeActive: boolean;
  implementationAddress: string;
  lastChecked: number;
}

async function fetchUsdsStatus(): Promise<UsdsStatus | null> {
  const res = await fetch(`${API_BASE}/api/usds-status`);
  if (!res.ok) throw new Error("Failed to fetch USDS status");
  return res.json();
}

export function useUsdsStatus() {
  return useQuery({
    queryKey: ["usds-status"],
    queryFn: fetchUsdsStatus,
    staleTime: 60 * 60 * 1000,      // 1 hour
    refetchInterval: 2 * 60 * 60 * 1000, // 2 hours
    retry: 1,
  });
}
