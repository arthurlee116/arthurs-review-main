import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
