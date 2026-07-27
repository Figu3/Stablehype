import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import CompareClient from "./client";

export const metadata: Metadata = {
  title: "Compare Stablecoins",
  description:
    "Side-by-side comparison of up to 5 stablecoins across market, peg stability, safety, and classification metrics.",
  alternates: { canonical: "/compare/" },
  openGraph: {
    title: "Compare Stablecoins | StableHype",
    description:
      "Side-by-side comparison of up to 5 stablecoins across market, peg stability, safety, and classification metrics.",
    url: "/compare/",
    type: "website",
    siteName: "StableHype",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function ComparePage() {
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
          <span className="text-foreground">Compare</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Compare Stablecoins</h1>
          <p className="text-sm text-muted-foreground">
            Pick up to 5 stablecoins for a side-by-side breakdown of market, peg, safety, and classification data.
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
          <CompareClient />
        </Suspense>
      </div>
    </>
  );
}
