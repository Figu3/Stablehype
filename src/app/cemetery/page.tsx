import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StablecoinCemetery } from "@/components/stablecoin-cemetery";
import { CemeteryCharts } from "@/components/cemetery-charts";
import { CemeteryTombstones } from "@/components/cemetery-tombstones";

export const metadata: Metadata = {
  title: "Stablecoin Cemetery — Failed & Defunct Stablecoins",
  description:
    "A memorial to 39 fallen stablecoins. From TerraUSD to HUSD — what went wrong, when, and why.",
  alternates: {
    canonical: "/cemetery/",
  },
  openGraph: {
    title: "Stablecoin Cemetery — Failed & Defunct Stablecoins",
    description:
      "A memorial to 39 fallen stablecoins. From TerraUSD to HUSD — what went wrong, when, and why.",
    url: "/cemetery/",
    type: "website",
    siteName: "Pharos",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function CemeteryPage() {
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
              { "@type": "ListItem", position: 2, name: "Stablecoin Cemetery", item: "https://pharos.watch/cemetery/" },
            ],
          }),
        }}
      />
      <div className="space-y-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Stablecoin Cemetery</h1>
        <p className="text-sm text-muted-foreground">
          Defunct, depegged, and discontinued. A memorial to fallen stablecoins.
        </p>
      </div>

      <CemeteryTombstones />

      <CemeteryCharts />

      <StablecoinCemetery />
    </div>
  );
}
