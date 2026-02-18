import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import { PegTrackerClient } from "./client";

const pegTrackerDescription = `Real-time peg deviation heatmap, weighted peg scores, and 4-year depeg event history for ${TRACKED_STABLECOINS.length} stablecoins.`;

export const metadata: Metadata = {
  title: "Peg Tracker — Stablecoin Peg Monitoring & History",
  description: pegTrackerDescription,
  alternates: {
    canonical: "/peg-tracker/",
  },
  openGraph: {
    title: "Peg Tracker — Stablecoin Peg Monitoring & History",
    description: pegTrackerDescription,
    url: "/peg-tracker/",
    type: "website",
    siteName: "Pharos",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function PegTrackerPage() {
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
              { "@type": "ListItem", position: 2, name: "Peg Tracker", item: "https://pharos.watch/peg-tracker/" },
            ],
          }),
        }}
      />
      <div className="space-y-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="text-foreground">Peg Tracker</span>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">Peg Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Real-time peg deviation monitoring, weighted peg scores, and depeg event history
          for {TRACKED_STABLECOINS.length} stablecoins.
        </p>
      </div>
      <Suspense>
        <PegTrackerClient />
      </Suspense>
    </div>
  );
}
