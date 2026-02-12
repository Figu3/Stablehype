import { Suspense } from "react";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import { HomepageClient } from "@/components/homepage-client";

export default function HomePage() {
  const total = TRACKED_STABLECOINS.length;
  const decentralized = TRACKED_STABLECOINS.filter(
    (s) => s.flags.governance === "decentralized"
  ).length;
  const cefiDep = TRACKED_STABLECOINS.filter(
    (s) => s.flags.governance === "centralized-dependent"
  ).length;
  const centralized = TRACKED_STABLECOINS.filter(
    (s) => s.flags.governance === "centralized"
  ).length;

  return (
    <>
      <div className="space-y-2 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Stablecoin Analytics Dashboard</h1>
        <p className="text-muted-foreground">
          {total} stablecoins. Every chain. Every freeze.
        </p>
        <p className="text-sm text-muted-foreground">
          Pharos tracks {total} stablecoins across every major chain with honest governance
          classification: {centralized} Centralized (CeFi), {cefiDep} CeFi-Dependent,
          and {decentralized} Decentralized (DeFi). Live market caps, peg deviations,
          blacklist events, and on-chain analytics — updated every 5 minutes.
        </p>
      </div>
      <Suspense fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-10 w-10 rounded-full bg-frost-blue/30 animate-pharos-pulse" />
        </div>
      }>
        <HomepageClient />
      </Suspense>
    </>
  );
}
