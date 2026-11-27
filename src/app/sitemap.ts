import type { MetadataRoute } from "next";
import { TRACKED_STABLECOINS } from "@shared/lib/stablecoins";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: "https://stablehype.com/",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: "https://stablehype.com/routes/",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.6,
    },
    {
      url: "https://stablehype.com/methodology/",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
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
    url: `https://stablehype.com/methodology/${slug}/`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));

  const stablecoinPages: MetadataRoute.Sitemap = TRACKED_STABLECOINS.map(
    (coin) => ({
      url: `https://stablehype.com/stablecoin/${coin.id}/`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })
  );

  return [...staticPages, ...methodologyPages, ...stablecoinPages];
}
