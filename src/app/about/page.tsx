import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEAD_STABLECOINS } from "@/lib/dead-stablecoins";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";

export const metadata: Metadata = {
  title: "About Pharos — Stablecoin Analytics & On-Chain Tracking",
  description:
    "About Pharos — an open stablecoin analytics dashboard by TokenBrice. Honest classification, freeze tracking, and a graveyard for the ones that didn't make it.",
  alternates: {
    canonical: "/about/",
  },
  openGraph: {
    title: "About Pharos — Stablecoin Analytics & On-Chain Tracking",
    description:
      "About Pharos — an open stablecoin analytics dashboard by TokenBrice. Honest classification, freeze tracking, and a graveyard for the ones that didn't make it.",
    url: "/about/",
    type: "website",
    siteName: "Pharos",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://pharos.watch" },
              { "@type": "ListItem", position: 2, name: "About Pharos", item: "https://pharos.watch/about/" },
            ],
          }),
        }}
      />
      <div className="space-y-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">About Pharos</h1>
        <p className="text-sm text-muted-foreground">
          An open stablecoin analytics dashboard.
        </p>
      </div>

      <Card className="rounded-2xl border-l-[3px] border-l-sky-500">
        <CardHeader>
          <CardTitle><h2>Why Pharos?</h2></CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Pharos is a personal project by{" "}
            <a
              href="https://tokenbrice.xyz/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4 hover:text-sky-500 transition-colors"
            >
              TokenBrice
              <ExternalLink className="inline h-3 w-3 ml-0.5 -mt-0.5" />
            </a>
            , built with the help of{" "}
            <a
              href="https://claude.ai/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4 hover:text-violet-500 transition-colors"
            >
              Claude
              <ExternalLink className="inline h-3 w-3 ml-0.5 -mt-0.5" />
            </a>
            .
          </p>
          <p>
            It started from a simple need: having the stablecoin data I wanted to monitor in one place — honest
            classification, freeze tracking, and a graveyard for the ones that didn&apos;t make it.
            I figured others might find it useful too, so here it is.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-l-[3px] border-l-amber-500">
        <CardHeader>
          <CardTitle><h2>What Pharos Tracks</h2></CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <ul className="space-y-2">
            <li className="flex gap-2">
              <span className="text-foreground font-mono font-semibold shrink-0">{TRACKED_STABLECOINS.length}</span>
              <span>stablecoins across every major chain, classified by governance model, backing type, and peg currency</span>
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-mono font-semibold shrink-0">{DEAD_STABLECOINS.length}</span>
              <span>dead stablecoins documented in the cemetery — algorithmic failures, rug pulls, regulatory shutdowns, and quiet abandonments</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">USDC &amp; USDT</span>
              <span>freeze/blacklist events tracked on-chain in real time across Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BSC, and Tron</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-l-[3px] border-l-violet-500">
        <CardHeader>
          <CardTitle><h2>Classification Philosophy</h2></CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Pharos uses a three-tier governance classification —
            <span className="text-foreground font-medium"> CeFi</span>,{" "}
            <span className="text-foreground font-medium">CeFi-Dependent</span>, and{" "}
            <span className="text-foreground font-medium">DeFi</span> — that reflects
            actual dependency on centralized infrastructure, not marketing claims.
          </p>
          <p>
            A stablecoin that uses decentralized smart contracts but holds T-bills at a custodian, hedges
            on Binance, or pegs via a USDC PSM is classified as CeFi-Dependent.
            Only stablecoins with fully on-chain collateral and no centralized custody
            dependency qualify as DeFi.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-l-[3px] border-l-zinc-500">
        <CardHeader>
          <CardTitle><h2>Data Sources &amp; Infrastructure</h2></CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <ul className="space-y-1.5">
            <li>
              <span className="text-foreground font-medium">DefiLlama</span> — primary source for supply, price, and chain data
            </li>
            <li>
              <span className="text-foreground font-medium">CoinGecko</span> — logos and supplementary data for gold-pegged tokens
            </li>
            <li>
              <span className="text-foreground font-medium">Etherscan v2 &amp; TronGrid</span> — on-chain freeze/blacklist events
            </li>
          </ul>
          <p className="pt-1">
            Built with Next.js, deployed on Cloudflare Pages. API runs as a Cloudflare Worker with D1 for storage.
            Data refreshes every 5 minutes.
          </p>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground pb-4">
        <p>
          Questions, corrections, or stablecoins we should add? Reach out on{" "}
          <a
            href="https://tokenbrice.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-4 hover:text-sky-500 transition-colors"
          >
            tokenbrice.xyz
            <ExternalLink className="inline h-3 w-3 ml-0.5 -mt-0.5" />
          </a>
          .
        </p>
      </div>
    </div>
  );
}
