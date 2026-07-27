import type { MetadataRoute } from "next";
import { TRACKED_STABLECOINS } from "@shared/lib/stablecoins";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: "https://stablehype.xyz/",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: "https://stablehype.xyz/depegs/",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: "https://stablehype.xyz/flows/",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    },
    {
      url: "https://stablehype.xyz/compare/",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: "https://stablehype.xyz/methodology/",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://stablehype.xyz/status/",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.3,
    },
  ];

  const methodologyPages: MetadataRoute.Sitemap = [
    "market-index",
    "supply-flows",
    "peg-score",
    "clear-stability-index",
    "dex-liquidity",
    "depeg-detection",
    "clear-oracle-risk",
    "redemption-backstops",
  ].map((slug) => ({
    url: `https://stablehype.xyz/methodology/${slug}/`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));

  const stablecoinPages: MetadataRoute.Sitemap = TRACKED_STABLECOINS.map(
    (coin) => ({
      url: `https://stablehype.xyz/stablecoin/${coin.id}/`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })
  );

  return [...staticPages, ...methodologyPages, ...stablecoinPages];
}
