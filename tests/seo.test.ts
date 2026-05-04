import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  it("keeps robots.txt dynamic so production SITE_URL is not baked as localhost", async () => {
    const robots = await import("@/app/robots");

    expect(robots.dynamic).toBe("force-dynamic");
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
    expect(metadata.openGraph).toMatchObject({
      title: "一篇真正有标题的文章",
      description: "这是一段专门给搜索和分享使用的描述。",
      url: "https://blog.leesaitool.com/commentary/real-title",
      type: "article",
    });
  });
});
