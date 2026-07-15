import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  cacheComponents: true,
  reactCompiler: true,
  cacheLife: {
    publicContent: {
      stale: 30,
      revalidate: 60,
      expire: 3_600,
    },
  },
  experimental: {
    useTypeScriptCli: true,
  },
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    formats: ["image/webp"],
    localPatterns: [
      {
        pathname: "/media/**",
        search: "",
      },
    ],
    minimumCacheTTL: 31_536_000,
    qualities: [82],
  },
};

export default nextConfig;
