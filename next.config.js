import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/Jo-Talks", // Matches your GitHub repository name
  assetPrefix: "/Jo-Talks/",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
