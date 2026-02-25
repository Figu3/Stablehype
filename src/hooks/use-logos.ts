"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import staticLogos from "../../data/logos.json";

async function fetchLogos(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/logos`);
  if (!res.ok) throw new Error("Failed to fetch logos");
  const data: Record<string, string> | null = await res.json();
  // API returns null when cache is empty — fall back to static
  return data ?? (staticLogos as Record<string, string>);
}

export function useLogos() {
  return useQuery({
    queryKey: ["logos"],
    queryFn: fetchLogos,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    // Serve static logos immediately while API fetch is in-flight
    placeholderData: staticLogos as Record<string, string>,
  });
}
