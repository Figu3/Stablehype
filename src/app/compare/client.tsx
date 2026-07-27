"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useStablecoins } from "@/hooks/use-stablecoins";
import { useLogos } from "@/hooks/use-logos";
import { usePegSummary } from "@/hooks/use-peg-summary";
import { useBluechipRatings } from "@/hooks/use-bluechip-ratings";
import { useDexLiquidity } from "@/hooks/use-dex-liquidity";
import { useCsi } from "@/hooks/use-csi";
import { CompareCoinPicker, MAX_COINS } from "@/components/compare-coin-picker";
import { CompareTable } from "@/components/compare-table";
import { findStablecoinMeta } from "@shared/lib/stablecoins";

const QUICK_PICKS = [
  { id: "1", label: "USDT" },
  { id: "2", label: "USDC" },
  { id: "5", label: "DAI" },
  { id: "146", label: "USDe" },
  { id: "209", label: "USDS" },
];

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    if (!findStablecoinMeta(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_COINS) break;
  }
  return ids;
}

export default function CompareClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const selectedIds = useMemo(() => parseIds(searchParams.get("coins")), [searchParams]);

  const { data: stablecoinsData, isLoading: coinsLoading } = useStablecoins();
  const { data: logos } = useLogos();
  const { data: pegSummary } = usePegSummary();
  const { data: bluechipRatings } = useBluechipRatings();
  const { data: dexLiquidity } = useDexLiquidity();
  const { data: csiData } = useCsi();

  const setIds = useCallback(
    (ids: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (ids.length === 0) {
        params.delete("coins");
      } else {
        params.set("coins", ids.join(","));
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const handleAdd = useCallback(
    (id: string) => {
      if (selectedIds.includes(id) || selectedIds.length >= MAX_COINS) return;
      setIds([...selectedIds, id]);
    },
    [selectedIds, setIds]
  );

  const handleRemove = useCallback(
    (id: string) => {
      setIds(selectedIds.filter((existing) => existing !== id));
    },
    [selectedIds, setIds]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border p-4 sm:p-5 space-y-4">
        <CompareCoinPicker
          selectedIds={selectedIds}
          onAdd={handleAdd}
          onRemove={handleRemove}
          logos={logos}
        />

        {selectedIds.length === 0 && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Search above or quick-pick a coin to start comparing up to {MAX_COINS} stablecoins side by side.
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PICKS.map((pick) => (
                <button
                  key={pick.id}
                  type="button"
                  onClick={() => handleAdd(pick.id)}
                  className="inline-flex items-center rounded-full border bg-muted/50 px-3 py-1.5 text-xs font-semibold hover:bg-accent transition-colors"
                >
                  {pick.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedIds.length === 0 ? (
        <div className="flex min-h-[15vh] items-center justify-center text-sm text-muted-foreground">
          No coins selected yet.
        </div>
      ) : coinsLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <div className="h-10 w-10 rounded-full bg-frost-blue/30 animate-hype-pulse" />
        </div>
      ) : (
        <CompareTable
          ids={selectedIds}
          peggedAssets={stablecoinsData?.peggedAssets}
          fxFallbackRates={stablecoinsData?.fxFallbackRates}
          logos={logos}
          pegSummary={pegSummary}
          bluechipRatings={bluechipRatings}
          csiData={csiData}
          dexLiquidity={dexLiquidity}
        />
      )}
    </div>
  );
}
