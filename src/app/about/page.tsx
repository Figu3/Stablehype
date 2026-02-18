import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Github } from "lucide-react";
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
    images: [{ url: "/og-card.png", width: 1200, height: 630 }],
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Why does Pharos exist?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Pharos is a personal project by TokenBrice, built to provide honest stablecoin classification, freeze tracking, and a graveyard for defunct stablecoins — all in one place. It started from a need to monitor stablecoin data with transparent governance labels rather than marketing claims.",
                },
              },
              {
                "@type": "Question",
                name: "What does Pharos track?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `Pharos tracks ${TRACKED_STABLECOINS.length} stablecoins across every major chain, classified by governance model, backing type, and peg currency. It also documents ${DEAD_STABLECOINS.length} dead stablecoins in the cemetery, monitors USDC, USDT, EURC, PAXG & XAUT freeze/blacklist events on-chain, provides continuous peg monitoring with composite Peg Scores, and integrates independent Bluechip safety ratings.`,
                },
              },
              {
                "@type": "Question",
                name: "How does Pharos classify stablecoins?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Pharos uses a three-tier governance classification — CeFi (fully centralized), CeFi-Dependent (decentralized infrastructure but relies on centralized stablecoins for collateral or peg maintenance), and DeFi (fully on-chain collateral, no centralized custody dependency). This reflects actual dependency on centralized infrastructure, not marketing claims.",
                },
              },
              {
                "@type": "Question",
                name: "How is the Peg Score calculated?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "The Peg Score ranges from 0 to 100 and combines two equally-weighted components: Time at Peg (50%) measures the percentage of the tracking window where the coin stayed within its peg threshold. Severity (50%) penalizes based on each depeg event's peak deviation, duration (capped at 90 days), and recency (recent events weigh more via exponential decay). An ongoing depeg applies an additional penalty of up to 50 points.",
                },
              },
              {
                "@type": "Question",
                name: "Where does Pharos get its data?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "All data is fetched server-side by a Cloudflare Worker. Primary sources include DefiLlama for supply, price, and chain distribution (refreshed every 5 minutes), CoinGecko for logos and gold-pegged tokens, Etherscan v2 for EVM freeze events, TronGrid for Tron freeze events, DexScreener as a price fallback, and Bluechip for independent safety ratings.",
                },
              },
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
          <CardTitle as="h2">Why Pharos?</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-5 text-sm text-muted-foreground leading-relaxed">
          <Image
            src="/tokenbrice.png"
            alt="TokenBrice"
            width={80}
            height={80}
            className="rounded-xl shrink-0 h-20 w-20"
          />
          <div className="space-y-3">
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
            It started from a simple need: having the stablecoin data I wanted to monitor in one place: honest
            classification, freeze tracking, and a graveyard for the ones that didn&apos;t make it.
            I figured others might find it useful too, so here it is.
          </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-l-[3px] border-l-amber-500">
        <CardHeader>
          <CardTitle as="h2">What Pharos Tracks</CardTitle>
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
              <span className="shrink-0">USDC, USDT, EURC, PAXG &amp; XAUT</span>
              <span>freeze/blacklist events tracked on-chain in real time across Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BSC, and Tron</span>
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-medium shrink-0">Peg Tracker</span>
              <span>
                continuous peg monitoring with a composite{" "}
                <Link href="/peg-tracker" className="text-foreground underline underline-offset-4 hover:text-amber-500 transition-colors">Peg Score</Link>
                {" "}for every tracked stablecoin, depeg event detection, heatmaps, and a historical timeline going back 4 years
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-medium shrink-0">Safety Ratings</span>
              <span>
                independent safety grades from{" "}
                <a href="https://bluechip.org" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4 hover:text-sky-500 transition-colors">
                  Bluechip<ExternalLink className="inline h-3 w-3 ml-0.5 -mt-0.5" />
                </a>
                {" "}for rated stablecoins, using the SMIDGE framework (Stability, Management, Implementation, Decentralization, Governance, Externals)
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-l-[3px] border-l-violet-500">
        <CardHeader>
          <CardTitle as="h2">Classification Philosophy</CardTitle>
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

      <Card className="rounded-2xl border-l-[3px] border-l-emerald-500">
        <CardHeader>
          <CardTitle as="h2">Peg Score Methodology</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            The{" "}
            <Link href="/peg-tracker" className="text-foreground underline underline-offset-4 hover:text-emerald-500 transition-colors">Peg Tracker</Link>
            {" "}assigns every tracked stablecoin a <span className="text-foreground font-medium">Peg Score</span> from
            {" "}<span className="font-mono">0</span> to <span className="font-mono">100</span>, computed from its full depeg event history.
            The score combines three components:
          </p>
          <ul className="space-y-2">
            <li className="flex gap-2">
              <span className="text-foreground font-medium shrink-0">Time at Peg (50%)</span>
              <span>percentage of the tracking window where the coin stayed within its peg threshold — a coin that never depegged scores 100% here</span>
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-medium shrink-0">Severity (50%)</span>
              <span>
                penalizes based on each depeg event&apos;s peak deviation magnitude, duration (capped at 90 days), and recency —
                recent events weigh more heavily than old ones (exponential decay: an event 1 year ago has half the weight of a current one)
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-medium shrink-0">Active Depeg</span>
              <span>an ongoing depeg applies an additional penalty of up to 50 points, scaled by current deviation severity</span>
            </li>
          </ul>
          <p>
            A minimum of <span className="font-mono">30 days</span> of tracking data is required before a score is assigned.
            NAV tokens (yield-accruing tokens like USYC, USDY) are excluded since their price naturally diverges from the peg.
          </p>
          <p>
            Peg reference rates for non-USD stablecoins (EUR, GBP, CHF, gold, etc.) are derived from the median price
            of stablecoins in each peg group with over $1M supply — this avoids hardcoding FX rates and keeps everything self-contained from on-chain data.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-l-[3px] border-l-zinc-500">
        <CardHeader>
          <CardTitle as="h2">Data Sources &amp; Infrastructure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            All data is fetched server-side by a Cloudflare Worker and cached in a D1 database.
            The frontend never calls external APIs directly.
          </p>
          <ul className="space-y-2">
            <li>
              <span className="text-foreground font-medium">DefiLlama</span> — primary source for stablecoin supply, price, chain distribution, and historical data.
              Refreshed every <span className="font-mono">5 minutes</span>.
            </li>
            <li>
              <span className="text-foreground font-medium">CoinGecko</span> — stablecoin logos, gold-pegged token data (XAUT, PAXG are not in DefiLlama&apos;s stablecoin API), and fallback price enrichment for assets DefiLlama misses.
              Logos refresh every <span className="font-mono">6 hours</span>.
            </li>
            <li>
              <span className="text-foreground font-medium">Etherscan v2</span> — USDC, USDT, EURC, PAXG, and XAUT freeze/blacklist events across EVM chains (Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BSC).
              Incremental sync every <span className="font-mono">15 minutes</span>.
            </li>
            <li>
              <span className="text-foreground font-medium">DexScreener</span> — best-effort price fallback for assets that DefiLlama and CoinGecko both miss, using on-chain DEX pair data filtered by liquidity.
            </li>
            <li>
              <span className="text-foreground font-medium">TronGrid</span> — USDT freeze events on Tron.
              Incremental sync every <span className="font-mono">15 minutes</span>.
            </li>
            <li>
              <span className="text-foreground font-medium">Bluechip</span> — independent stablecoin safety ratings using the SMIDGE framework.
              Ratings refreshed every <span className="font-mono">6 hours</span>.{" "}
              <a href="https://bluechip.org" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4 hover:text-sky-500 transition-colors">
                bluechip.org<ExternalLink className="inline h-3 w-3 ml-0.5 -mt-0.5" />
              </a>
            </li>
          </ul>
          <p className="pt-1">
            Built with Next.js (static export), deployed on Cloudflare Pages.
            The API layer is a Cloudflare Worker with D1 (SQLite) for storage.
            All external API calls are proxied through the Worker — API keys never reach the browser.
          </p>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground pb-4 space-y-2">
        <p>
          Pharos is fully open source.{" "}
          <a
            href="https://github.com/TokenBrice/stablecoin-dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline underline-offset-4 hover:text-sky-500 transition-colors"
          >
            <Github className="inline h-3.5 w-3.5" />
            View on GitHub
            <ExternalLink className="inline h-3 w-3" />
          </a>
        </p>
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
