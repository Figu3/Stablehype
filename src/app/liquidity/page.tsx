import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import { LiquidityClient } from "./client";

const liquidityDescription = `DEX liquidity scores, pool depth analysis, and protocol breakdowns for ${TRACKED_STABLECOINS.length} stablecoins across Curve, Uniswap, Fluid, and more.`;

export const metadata: Metadata = {
  title: "DEX Liquidity — Stablecoin Pool Depth & Volume",
  description: liquidityDescription,
  alternates: {
    canonical: "/liquidity/",
  },
  openGraph: {
    title: "DEX Liquidity — Stablecoin Pool Depth & Volume",
    description: liquidityDescription,
    url: "/liquidity/",
    type: "website",
    siteName: "Pharos",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function LiquidityPage() {
  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://pharos.watch" },
              { "@type": "ListItem", position: 2, name: "DEX Liquidity", item: "https://pharos.watch/liquidity/" },
            ],
          }),
        }}
      />
      <div className="space-y-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="text-foreground">DEX Liquidity</span>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">DEX Liquidity</h1>
        <p className="text-sm text-muted-foreground">
          Liquidity scores, pool depth, and protocol breakdowns for {TRACKED_STABLECOINS.length} stablecoins
          across decentralized exchanges.
        </p>
      </div>
      <Suspense>
        <LiquidityClient />
      </Suspense>
    </div>
  );
}
