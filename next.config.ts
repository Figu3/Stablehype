import type { NextConfig } from "next";

// Control-center pages are named `page.control.tsx`: only the control build picks them up.
const isControlSite = process.env.NEXT_PUBLIC_SITE_MODE === "control";

const nextConfig: NextConfig = {
  output: "export",
  pageExtensions: isControlSite ? ["control.tsx", "tsx", "ts"] : ["tsx", "ts"],
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_API_BASE:
      process.env.NEXT_PUBLIC_API_BASE ||
      "https://stablecoin-api.romain-figuereo.workers.dev",
  },
};

export default nextConfig;
