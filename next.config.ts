import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/stablecoin-dashboard",
  images: { unoptimized: true },
};

export default nextConfig;
