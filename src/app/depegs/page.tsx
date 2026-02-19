import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import DepegsClient from "./client";

export const metadata: Metadata = {
  title: "Depeg History",
  description:
    "Historical depeg events and recovery patterns across 118+ stablecoins. Timeline view and chronological feed of peg deviations.",
  alternates: { canonical: "/depegs/" },
  openGraph: {
    title: "Depeg History | StableHype",
    description:
      "Historical depeg events and recovery patterns across 118+ stablecoins.",
    url: "/depegs/",
    type: "website",
    siteName: "StableHype",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function DepegsPage() {
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
          <span className="text-foreground">Depeg History</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Depeg History</h1>
          <p className="text-sm text-muted-foreground">
            Historical depeg events and recovery patterns across all tracked
            stablecoins.
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
          <DepegsClient />
        </Suspense>
      </div>
    </>
  );
}
