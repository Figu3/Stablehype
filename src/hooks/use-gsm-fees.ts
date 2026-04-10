"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface GsmFeesData {
  totalFeesUSD: number;
  rebalanceCount: number;
  resetAt: number | null;
  refundsUSD: number;
  gsmMintedWithUSDC: number;
  gsmMintedWithUSDT: number;
  gsmRedeemedToUSDT: number;
  gsmRedeemedToUSDC: number;
}

async function fetchGsmFees(): Promise<GsmFeesData> {
  const resp = await fetch(`${API_BASE}/api/gsm-fees`);
  if (!resp.ok) throw new Error(`gsm-fees API error: ${resp.status}`);
  return resp.json();
}

export function useGsmFees() {
  return useQuery({
    queryKey: ["gsm-fees"],
    queryFn: fetchGsmFees,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useGsmFeesReset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const resp = await fetch(`${API_BASE}/api/gsm-fees/reset`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
      });
      if (!resp.ok) throw new Error(`gsm-fees reset error: ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gsm-fees"] });
    },
  });
}
