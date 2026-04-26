"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface ClearFeeWindow {
  days: number;
  volumeUSD: number;
  swapCount: number;
  treasuryFeeUSD: number;
  lpFeeUSD: number;
  spreadFeeUSD: number;
  totalFeeUSD: number;
  treasuryBps: number;
  lpBps: number;
  spreadBps: number;
  totalBps: number;
}

export interface ClearFeesData {
  windows: ClearFeeWindow[];
}

async function fetchClearFees(): Promise<ClearFeesData> {
  const resp = await fetch(`${API_BASE}/api/clear-fees`);
  if (!resp.ok) throw new Error(`clear-fees API error: ${resp.status}`);
  return resp.json();
}

export function useClearFees() {
  return useQuery({
    queryKey: ["clear-fees"],
    queryFn: fetchClearFees,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
