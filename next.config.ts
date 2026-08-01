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
    // Matches MAX_VIDEO_BYTES in src/lib/media/video.ts — proxy buffers the full
    // request body, and its default 10MB limit truncates video uploads.
    proxyClientMaxBodySize: "200mb",
  },
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
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
