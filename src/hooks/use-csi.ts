"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { CsiResponse } from "@shared/lib/csi-types";

async function fetchCsi(): Promise<CsiResponse | null> {
  const res = await fetch(`${API_BASE}/api/csi`);
  if (!res.ok) {
    if (res.status === 503) return null;
    throw new Error("Failed to fetch CSI");
  }
  return res.json();
}

export function useCsi() {
  return useQuery({
    queryKey: ["csi"],
    queryFn: fetchCsi,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
