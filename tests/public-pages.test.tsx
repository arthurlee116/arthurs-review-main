import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArticlePage } from "@/app/_articlePage";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-public-"));
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

describe("public article pages", () => {
  it("renders an article cover image when one is configured", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    migrate();

    const article = createArticle(
      articleInput({
        titleZh: "有封面的文章",
        slug: "with-cover",
        category: "society",
        coverImagePath: "uploads/2026/05/cover.webp",
        bodyZh: "正文。",
      }),
    );
    publishArticle(article.id);

    render(await ArticlePage({ category: "society", slug: "with-cover" }));

    const image = screen.getByRole("img", { name: "有封面的文章" });
    expect(image).toHaveAttribute("src", "/media/2026/05/cover.webp");
  });

  it("keeps article pages to one h1 and emits BlogPosting JSON-LD", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    migrate();

    const article = createArticle(
      articleInput({
        titleZh: "真正的页面标题",
        slug: "structured-article",
        category: "commentary",
        seoDescription: "给搜索引擎看的短描述。",
        coverImagePath: "uploads/2026/05/cover.webp",
        bodyZh: "# 正文里不该再抢 H1\n\n正文。",
      }),
    );
    const published = publishArticle(article.id);

    const { container } = render(await ArticlePage({ category: "commentary", slug: "structured-article" }));
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("真正的页面标题");
    expect(screen.getByRole("heading", { level: 2, name: "正文里不该再抢 H1" })).toBeInTheDocument();

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script?.textContent).toBeTruthy();
    const jsonLd = JSON.parse(script!.textContent!);
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: "真正的页面标题",
      description: "给搜索引擎看的短描述。",
      url: "https://blog.leesaitool.com/commentary/structured-article",
      datePublished: published.publishedAt,
      dateModified: published.updatedAt,
      author: {
        "@type": "Person",
        name: "Arthur",
      },
      publisher: {
        "@type": "Organization",
        name: "Arthur's Review",
        url: "https://blog.leesaitool.com/",
      },
      image: ["https://blog.leesaitool.com/media/2026/05/cover.webp"],
    });
  });
});
