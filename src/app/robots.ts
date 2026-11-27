import type { MetadataRoute } from "next";
import { IS_CONTROL_SITE } from "@/lib/site-mode";

export const dynamic = "force-static";

/** Only the investor site (stablehype.com) is meant to be found by search engines. */
export default function robots(): MetadataRoute.Robots {
  if (IS_CONTROL_SITE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://stablehype.com/sitemap.xml",
  };
}
