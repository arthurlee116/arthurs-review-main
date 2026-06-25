import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Arthur's Review",
    template: "%s | Arthur's Review",
  },
  description: "Arthur's Review, a personal intellectual publication.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": absoluteUrl("/about#arthur"),
        name: "Arthur",
        url: absoluteUrl("/about"),
      },
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        name: "Arthur's Review",
        url: absoluteUrl("/"),
        description: "Arthur's Review, a personal intellectual publication.",
        inLanguage: "zh-CN",
        publisher: {
          "@id": absoluteUrl("/about#arthur"),
        },
      },
    ],
  };

  return (
    <html lang="zh-CN">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        {children}
      </body>
    </html>
  );
}
