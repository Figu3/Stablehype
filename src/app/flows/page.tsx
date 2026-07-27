import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import FlowsClient from "./client";

export const metadata: Metadata = {
  title: "Supply Flows",
  description:
    "Net mint and burn flows for every tracked stablecoin over 24h, 7d, and 30d, with a market-wide bank-run gauge derived from redemption pressure.",
  alternates: { canonical: "/flows/" },
  openGraph: {
    title: "Supply Flows | StableHype",
    description:
      "Net mint and burn flows for every tracked stablecoin, with a market-wide bank-run gauge.",
    url: "/flows/",
    type: "website",
    siteName: "StableHype",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function FlowsPage() {
  return (
    <>
      <div className="space-y-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link href="/" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-foreground">Supply Flows</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Supply Flows</h1>
          <p className="text-sm text-muted-foreground">
            Net minting and redemption per stablecoin, scored against each
            coin&apos;s own 30-day baseline.
          </p>
        </div>
      </div>
      <div className="mt-6">
        <Suspense
          fallback={
            <div className="flex min-h-[20vh] items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-frost-blue/30 animate-hype-pulse" />
            </div>
          }
        >
          <FlowsClient />
        </Suspense>
      </div>
    </>
  );
}
