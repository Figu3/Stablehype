import { NextResponse } from "next/server";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";

/**
 * Returns historical supply data broken down by governance (centralized vs decentralized).
 * Fetches individual stablecoin histories for the top coins by mcap, then aggregates.
 * To avoid excessive API calls, we only fetch the top 20 (covers ~98% of supply).
 */

// Top 20 stablecoins by typical mcap — covers the vast majority of total supply
const TOP_IDS = [
  "1", "2", "146", "209", "262", "5", "120", "246", "237", "286",
  "250", "129", "173", "14", "221", "213", "336", "309", "195", "118",
];

export async function GET() {
  try {
    // Build governance lookup
    const governanceMap: Record<string, string> = {};
    for (const s of TRACKED_STABLECOINS) {
      governanceMap[s.id] = s.flags.governance;
    }

    // Fetch histories in parallel (top 20)
    const fetches = TOP_IDS.map(async (id) => {
      try {
        const res = await fetch(`${DEFILLAMA_BASE}/stablecoin/${id}`, {
          next: { revalidate: 3600 },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return { id, tokens: data.tokens ?? [] };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(fetches);

    // Aggregate by date -> governance type
    // Sample weekly over last 365 days
    const now = Date.now() / 1000;
    const oneYearAgo = now - 365 * 86400;

    // Collect all unique dates from first successful result
    const dateSet = new Set<number>();
    for (const r of results) {
      if (!r) continue;
      for (let i = 0; i < r.tokens.length; i += 7) {
        const ts = Number(r.tokens[i].date);
        if (ts >= oneYearAgo) dateSet.add(ts);
      }
      break; // all stablecoins share the same date grid
    }

    const dates = Array.from(dateSet).sort((a, b) => a - b);

    // Build per-date index for each stablecoin
    const coinDateMaps: { id: string; dateMap: Map<number, number> }[] = [];
    for (const r of results) {
      if (!r) continue;
      const dateMap = new Map<number, number>();
      for (const t of r.tokens) {
        const circ = t.circulating;
        const val = circ ? Object.values(circ).reduce((s: number, v: unknown) => s + (Number(v) || 0), 0) : 0;
        dateMap.set(Number(t.date), val);
      }
      coinDateMaps.push({ id: r.id, dateMap });
    }

    // Aggregate
    const chart = dates.map((date) => {
      let centralized = 0;
      let decentralized = 0;

      for (const { id, dateMap } of coinDateMaps) {
        const val = dateMap.get(date) ?? 0;
        const gov = governanceMap[id] ?? "centralized";
        if (gov === "decentralized") decentralized += val;
        else centralized += val;
      }

      return { date, centralized, decentralized };
    });

    return NextResponse.json(chart, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
