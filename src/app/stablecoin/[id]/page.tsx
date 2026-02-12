import type { Metadata } from "next";
import Link from "next/link";
import { TRACKED_STABLECOINS, findStablecoinMeta } from "@/lib/stablecoins";
import { getFilterTags, FILTER_TAG_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import StablecoinDetailClient from "./client";

export function generateStaticParams() {
  return TRACKED_STABLECOINS.map((coin) => ({ id: coin.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const coin = findStablecoinMeta(id);

  if (!coin) {
    return { title: "Stablecoin Not Found" };
  }

  const desc = coin.collateral
    ? `Live analytics for ${coin.name} (${coin.symbol}). Price, market cap, supply trends, and chain distribution. ${coin.collateral}`
    : `Live analytics for ${coin.name} (${coin.symbol}). Price, market cap, supply trends, and chain distribution.`;

  return {
    title: `${coin.name} (${coin.symbol})`,
    description: desc,
    alternates: {
      canonical: `/stablecoin/${id}/`,
    },
    openGraph: {
      title: `${coin.name} (${coin.symbol})`,
      description: desc,
      url: `/stablecoin/${id}/`,
      type: "website",
      siteName: "Pharos",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

const GOVERNANCE_LABELS: Record<string, string> = {
  centralized: "Centralized (CeFi)",
  "centralized-dependent": "CeFi-Dependent",
  decentralized: "Decentralized (DeFi)",
};

const BACKING_LABELS: Record<string, string> = {
  "rwa-backed": "Real-World Asset Backed",
  "crypto-backed": "Crypto-Collateralized",
  algorithmic: "Algorithmic",
};

const PEG_LABELS: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  CHF: "Swiss Franc",
  BRL: "Brazilian Real",
  RUB: "Russian Ruble",
  GOLD: "Gold",
  VAR: "Variable (CPI-linked)",
  OTHER: "Other",
};

export default async function StablecoinDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coin = findStablecoinMeta(id);
  const tags = coin ? getFilterTags(coin) : [];

  return (
    <>
      {coin && (
        <div className="space-y-6">
          <div className="space-y-2">
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground transition-colors">Dashboard</Link>
              <span>/</span>
              <span className="text-foreground">{coin.name}</span>
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{coin.name}</h1>
            <span className="text-xl text-muted-foreground font-mono">{coin.symbol}</span>
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary">{FILTER_TAG_LABELS[tag]}</Badge>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            {coin.name} is a {GOVERNANCE_LABELS[coin.flags.governance] ?? coin.flags.governance},{" "}
            {BACKING_LABELS[coin.flags.backing] ?? coin.flags.backing} stablecoin
            {" "}pegged to the {PEG_LABELS[coin.flags.pegCurrency] ?? coin.flags.pegCurrency}.
            {coin.collateral && ` Backed by: ${coin.collateral}.`}
            {coin.pegMechanism && ` Peg mechanism: ${coin.pegMechanism}.`}
          </p>
        </div>
      )}
      <StablecoinDetailClient id={id} />
      {coin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Home",
                  item: "https://pharos.watch",
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: `${coin.name} (${coin.symbol})`,
                  item: `https://pharos.watch/stablecoin/${id}/`,
                },
              ],
            }),
          }}
        />
      )}
    </>
  );
}
