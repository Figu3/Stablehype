import type { Metadata } from "next";
import Link from "next/link";
import { SeveSection } from "@/components/clear-protocol/seve-section";

export const metadata: Metadata = {
  title: "Sève",
  description:
    "Live telemetry from Sève — a protocol-aligned arbitrage bot that captures Clear↔DEX spreads and forwards profit to its owner.",
  alternates: { canonical: "/seve/" },
  openGraph: {
    title: "Sève | StableHype",
    description:
      "Live telemetry from Sève — a Clear-aligned arbitrage bot. Per-block ticks, opportunities, submissions, and errors from the running searcher.",
    url: "/seve/",
    type: "website",
    siteName: "StableHype",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function SevePage() {
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
          <span className="text-foreground">Sève</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Sève</h1>
          <p className="text-sm text-muted-foreground">
            Protocol-aligned arbitrage bot capturing Clear↔DEX spreads. Live
            per-block telemetry: ticks, opportunities, submissions, and errors
            from the running searcher.
          </p>
        </div>
      </div>
      <div className="mt-6">
        <SeveSection />
      </div>
    </>
  );
}
