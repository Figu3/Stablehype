import type { Metadata } from "next";
import { TRACKED_STABLECOINS, findStablecoinMeta } from "@/lib/stablecoins";
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
    },
  };
}

export default async function StablecoinDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coin = findStablecoinMeta(id);

  return (
    <>
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
