"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

async function fetchLogos(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/logos`);
  if (!res.ok) return {};
  return res.json();
}

export function useLogos() {
  return useQuery({
    queryKey: ["logos"],
    queryFn: fetchLogos,
    staleTime: 24 * 60 * 60 * 1000, // 24h
    refetchInterval: false,
    retry: 1,
  });
}
