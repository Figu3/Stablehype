import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEventDate } from "@/lib/format";
import { METHODOLOGY_MODULES } from "./[slug]/page";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "Every score on StableHype is versioned. Browse the formulas, weights, and changelogs behind the Clear Stability Index, peg score, DEX liquidity score, and every other methodology module.",
  alternates: { canonical: "/methodology/" },
  openGraph: {
    title: "Methodology | StableHype",
    description:
      "Every score on StableHype is versioned — formulas change only with a changelog entry.",
    url: "/methodology/",
    type: "website",
    siteName: "StableHype",
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
  },
};

export default function MethodologyIndexPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link href="/" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-foreground">Methodology</span>
        </nav>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Methodology</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every score on Stablehype is versioned — formulas change only
            with a changelog entry. Browse each module below for its current
            weights, what it measures, and its full version history.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {METHODOLOGY_MODULES.map((mod) => {
          const latest = mod.version.changelog[0];
          return (
            <Link key={mod.slug} href={`/methodology/${mod.slug}/`}>
              <Card className="h-full transition-colors hover:border-frost-blue/40">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <CardTitle className="text-base">{mod.name}</CardTitle>
                  <Badge
                    variant="outline"
                    className="border-frost-blue/30 bg-frost-blue/10 font-mono text-frost-blue"
                  >
                    {mod.version.versionLabel}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="line-clamp-3 text-xs text-muted-foreground">
                    {mod.description}
                  </p>
                  {latest && (
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                      Latest: {formatEventDate(latest.effectiveAt)} &middot;{" "}
                      {latest.title}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
