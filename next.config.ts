import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/stablecoin-dashboard",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
