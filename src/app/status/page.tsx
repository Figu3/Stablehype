import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import StatusClient from "./client";

export const metadata: Metadata = {
  title: "Status",
  description:
    "Live data freshness for StableHype: cache ages, background job health, and update cadences for every data source.",
  alternates: { canonical: "/status/" },
  openGraph: {
    title: "Status | StableHype",
    description:
      "Live data freshness for StableHype: cache ages and background job health.",
    url: "/status/",
    type: "website",
    siteName: "StableHype",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function StatusPage() {
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
          <span className="text-foreground">Status</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Status</h1>
          <p className="text-sm text-muted-foreground">
            Data freshness and background job health for every source
            StableHype depends on.
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
          <StatusClient />
        </Suspense>
      </div>
    </>
  );
}
