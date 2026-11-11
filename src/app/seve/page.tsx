import type { Metadata } from "next";
import Link from "next/link";
import { SeveSection } from "@/components/clear-protocol/seve-section";

export const metadata: Metadata = {
  title: "Sève",
  description:
    "Sève borrows on Wildcat and supplies liquidity to Clear: its loan, its reserve shares and what rebalancing earns.",
  alternates: { canonical: "/seve/" },
  openGraph: {
    title: "Sève | StableHype",
    description:
      "Sève borrows on Wildcat and supplies liquidity to Clear: its loan, its reserve shares and what rebalancing earns.",
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
          <h1 className="text-2xl font-bold tracking-tight">Sève</h1>
          <p className="text-sm text-muted-foreground">
            Sève borrows stablecoins on Wildcat and puts them to work as Clear liquidity.
          </p>
        </div>
      </div>
      <div className="mt-6">
        <SeveSection />
      </div>
    </>
  );
}
