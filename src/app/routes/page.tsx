import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import RoutesClient from "./client";

export const metadata: Metadata = {
  title: "Clear Routes",
  description:
    "Live swap route status for Clear Protocol stablecoins. See which depeg routes are open or closed based on on-chain oracle data.",
  alternates: { canonical: "/routes/" },
  openGraph: {
    title: "Clear Routes | StableHype",
    description:
      "Live swap route status for Clear Protocol stablecoins.",
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
          <span className="text-foreground">Clear Routes</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Clear Routes</h1>
          <p className="text-sm text-muted-foreground">
            Live swap route status for Clear Protocol stablecoins based on
            on-chain oracle data.
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
