import type { Metadata } from "next";
import Link from "next/link";
import { ClearArb } from "@/components/clear-arb";

export const metadata: Metadata = {
  title: "Clear Arb",
  description: "Arb bots on Clear Protocol: what each one made, and what Clear earned on their swaps.",
  alternates: { canonical: "/arb/" },
  openGraph: {
    title: "Clear Arb | StableHype",
    description: "Arb bots on Clear Protocol: what each one made, and what Clear earned on their swaps.",
    url: "/arb/",
    type: "website",
    siteName: "StableHype",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function ArbPage() {
  return (
    <>
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-foreground">Arb</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Arb</h1>
          <p className="text-sm text-muted-foreground">
            Every bot that swaps on Clear V1: what it kept, and what Clear earned on its swaps.
          </p>
        </div>
      </div>
      <div className="mt-6">
        <ClearArb />
      </div>
    </>
  );
}
