import type { Metadata } from "next";
import { PegTrackerClient } from "./client";

export const metadata: Metadata = {
  title: "Peg Tracker — Stablecoin Peg Monitoring & History",
  description:
    "Real-time peg deviation heatmap, weighted peg scores, and 4-year depeg event history for 115+ stablecoins.",
  alternates: {
    canonical: "/peg-tracker/",
  },
  openGraph: {
    title: "Peg Tracker — Stablecoin Peg Monitoring & History",
    description:
      "Real-time peg deviation heatmap, weighted peg scores, and 4-year depeg event history for 115+ stablecoins.",
    url: "/peg-tracker/",
    type: "website",
    siteName: "Pharos",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
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
      <PegTrackerClient />
    </div>
  );
}
