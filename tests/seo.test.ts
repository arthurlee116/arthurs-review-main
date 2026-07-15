import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-seo-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "https://blog.leesaitool.com";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
  process.env.SESSION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("SEO and discovery metadata", () => {
  it("builds robots.txt from the production SITE_URL", async () => {
    const robots = await import("@/app/robots");

    expect(robots.default().sitemap).toBe("https://blog.leesaitool.com/sitemap.xml");
  });

  it("generates article metadata from the stored article SEO fields", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const page = await import("@/app/commentary/[slug]/page");
    migrate();

    const article = createArticle(
      articleInput({
        titleZh: "一篇真正有标题的文章",
        slug: "real-title",
        category: "commentary",
        excerptZh: "摘要不是 SEO 描述。",
        seoDescription: "这是一段专门给搜索和分享使用的描述。",
        bodyZh: "正文。",
      }),
    );
    publishArticle(article.id);

    const metadata = await page.generateMetadata({
      params: Promise.resolve({ slug: "real-title" }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe("一篇真正有标题的文章");
    expect(metadata.description).toBe("这是一段专门给搜索和分享使用的描述。");
    expect(metadata.alternates?.canonical).toBe("https://blog.leesaitool.com/commentary/real-title");
    expect(metadata.alternates?.types).toEqual({
      "application/rss+xml": "https://blog.leesaitool.com/feed.xml",
    });
    expect(metadata.openGraph).toMatchObject({
      title: "一篇真正有标题的文章",
      description: "这是一段专门给搜索和分享使用的描述。",
      url: "https://blog.leesaitool.com/commentary/real-title",
      type: "article",
      images: [
        {
          url: "https://blog.leesaitool.com/og?title=%E4%B8%80%E7%AF%87%E7%9C%9F%E6%AD%A3%E6%9C%89%E6%A0%87%E9%A2%98%E7%9A%84%E6%96%87%E7%AB%A0&kicker=%E6%97%B6%E4%BA%8B%E8%AF%84%E8%AE%BA",
          alt: "一篇真正有标题的文章",
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "一篇真正有标题的文章",
    });
  });

  it("keeps uploaded cover art as the social image", async () => {
    const { publicPageMetadata } = await import("@/lib/metadata");

    const metadata = publicPageMetadata({
      title: "Cover story",
      path: "/misc/cover-story",
      imagePath: "uploads/2026/07/cover.webp",
    });

    expect(metadata.openGraph).toMatchObject({
      images: [{ url: "https://blog.leesaitool.com/media/2026/07/cover.webp", alt: "Cover story" }],
    });
  });

  it("advertises RSS and generates a PNG social card", async () => {
    const layout = await import("@/app/layout");
    const og = await import("@/app/og/route");

    expect(layout.metadata.alternates?.types).toEqual({
      "application/rss+xml": "https://blog.leesaitool.com/feed.xml",
    });
    expect(layout.viewport).toEqual({ width: "device-width", initialScale: 1 });

    const response = og.GET(new Request("https://blog.leesaitool.com/og?title=Proofs&kicker=Arthur%27s%20Review"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("keeps archive and proof indexes in the sitemap", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const sitemap = await import("@/app/sitemap");
    migrate();

    const urls = (await sitemap.default()).map((entry) => entry.url);

    expect(urls).toContain("https://blog.leesaitool.com/archive");
    expect(urls).toContain("https://blog.leesaitool.com/proofs");
  });

  it("emits site and author JSON-LD from the root layout", async () => {
    const layout = await import("@/app/layout");
    const html = renderToStaticMarkup(await layout.default({ children: null }));
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match?.[1]).toBeTruthy();

    const jsonLd = JSON.parse(match![1]);
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Person",
          "@id": "https://blog.leesaitool.com/about#arthur",
          name: "Arthur",
          url: "https://blog.leesaitool.com/about",
        },
        {
          "@type": "WebSite",
          "@id": "https://blog.leesaitool.com/#website",
          name: "Arthur's Review",
          url: "https://blog.leesaitool.com/",
          inLanguage: "zh-CN",
          publisher: {
            "@id": "https://blog.leesaitool.com/about#arthur",
          },
        },
      ],
    });
  });
});
