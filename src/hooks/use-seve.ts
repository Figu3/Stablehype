"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface SeveLatestTick {
  ts: string;
  block_number: number;
  abs_depeg_bps_max: number;
}

export interface SeveStats {
  countsByKind24h: Array<{ kind: string; n_24h: number }>;
  countsByKindAllTime: Array<{ kind: string; n: number }>;
  submits: { dry_run_submits: number | null; live_submits: number | null; total_submits: number };
  opportunities: { total: number; profitable: number | null };
  latestTick: SeveLatestTick | null;
}

export interface SeveEventRow {
  id: number;
  event_id: string;
  ts: string;
  kind: "tick" | "opportunity" | "submit" | "error";
  block_number: number | null;
  route: string | null;
  size_usd: number | null;
  abs_depeg_bps_max: number | null;
  gross_edge_bps: number | null;
  gas_usd: number | null;
  net_edge_usd: number | null;
  profitable: number | null;
  simulated_profit: string | null;
  bundle_hashes: string | null;
  dry_run: number | null;
  error_message: string | null;
}

async function fetchSeveStats(): Promise<SeveStats> {
  const r = await fetch(`${API_BASE}/api/seve/stats`);
  if (!r.ok) throw new Error(`seve stats: ${r.status}`);
  return r.json();
}

async function fetchSeveRecent(kind?: string, limit = 100): Promise<{ events: SeveEventRow[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (kind) params.set("kind", kind);
  const r = await fetch(`${API_BASE}/api/seve/recent?${params}`);
  if (!r.ok) throw new Error(`seve recent: ${r.status}`);
  return r.json();
}

export function useSeveStats() {
  return useQuery({
    queryKey: ["seve-stats"],
    queryFn: fetchSeveStats,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useSeveRecent(kind?: string, limit = 100) {
  return useQuery({
    queryKey: ["seve-recent", kind ?? null, limit],
    queryFn: () => fetchSeveRecent(kind, limit),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
