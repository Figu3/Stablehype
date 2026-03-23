import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import RoutesClient from "./client";

export const metadata: Metadata = {
  title: "Clear Terminal",
  description:
    "Live transaction feed for Clear Protocol — swaps, rebalances, and fee data from on-chain events.",
  alternates: { canonical: "/routes/" },
  openGraph: {
    title: "Clear Terminal | StableHype",
    description:
      "Live transaction feed for Clear Protocol swaps and rebalances.",
    url: "/routes/",
    type: "website",
    siteName: "StableHype",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function RoutesPage() {
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
          <span className="text-foreground">Clear Terminal</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Clear Terminal</h1>
          <p className="text-sm text-muted-foreground">
            All Clear Protocol transactions — swaps and rebalances from on-chain events.
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
          <RoutesClient />
        </Suspense>
      </div>
    </>
  );
}
