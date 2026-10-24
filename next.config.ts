import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  cacheComponents: true,
  reactCompiler: true,
  // Preserve Next's default crawler list and add Googlebot. Browsers keep normal
  // streaming and prefetch behavior; crawlers receive canonical/robots in <head>.
  htmlLimitedBots: /Googlebot|[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i,
  cacheLife: {
    publicContent: {
      stale: 30,
      revalidate: 60,
      expire: 3_600,
    },
  },
  experimental: {
    globalNotFound: true,
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
      ...[
        "/feed.xml",
        "/:locale(zh|en)/feed.xml",
        "/proofs/:id/:kind(ots|source)",
        "/healthz",
        "/version",
        "/robots.txt",
        "/sitemap.xml",
      ].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
      })),
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
