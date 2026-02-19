import type { MetadataRoute } from "next";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";

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
  ];

  const stablecoinPages: MetadataRoute.Sitemap = TRACKED_STABLECOINS.map(
    (coin) => ({
      url: `https://stablehype.xyz/stablecoin/${coin.id}/`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })
  );

  return [...staticPages, ...stablecoinPages];
}
