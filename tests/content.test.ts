import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "http://localhost:3000";
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

describe("environment and database bootstrap", () => {
  it("creates expected data directories", async () => {
    const { ensureDataDirectories } = await import("@/lib/env");
    const dirs = ensureDataDirectories();

    expect(fs.existsSync(dirs.markdownDir)).toBe(true);
    expect(fs.existsSync(dirs.uploadsDir)).toBe(true);
    expect(fs.existsSync(dirs.backupsDir)).toBe(true);
  });

  it("runs migrations and creates core tables", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { getDb } = await import("@/lib/db/connection");

    migrate();
    const db = getDb();
    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain("articles");
    expect(tables).toContain("tags");
    expect(tables).toContain("article_tags");
    expect(tables).toContain("settings");
  });
});

describe("content helpers", () => {
  it("normalizes slugs into stable URL-safe ids", async () => {
    const { normalizeSlug } = await import("@/lib/content/slugs");

    expect(normalizeSlug(" City and Loneliness! ")).toBe("city-and-loneliness");
    expect(normalizeSlug("already-good")).toBe("already-good");
  });

  it("builds article URLs from category and slug", async () => {
    const { articlePath } = await import("@/lib/content/urls");

    expect(articlePath("commentary", "short-note")).toBe("/commentary/short-note");
    expect(articlePath("society", "city")).toBe("/society/city");
    expect(articlePath("misc", "poem")).toBe("/misc/poem");
  });

  it("writes and reads markdown bodies under the data directory", async () => {
    const { writeMarkdownBody, readMarkdownBody } = await import("@/lib/content/markdown");

    const relPath = writeMarkdownBody(12, "zh", "# 标题\n\n正文");

    expect(relPath).toMatch(/^markdown\/12\.zh\.[a-f0-9]{64}\.md$/);
    expect(readMarkdownBody(relPath)).toBe("# 标题\n\n正文");
  });
});

describe("article service", () => {
  it("creates a draft article with markdown bodies and tags", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, getArticleById } = await import("@/lib/services/articles");
    migrate();

    const article = createArticle({
      titleZh: "短评的锋利应该留一点余温",
      titleEn: "A Short Note With Warmth",
      slug: "short-note-with-warmth",
      category: "commentary",
      excerptZh: "一段短评摘要",
      excerptEn: "A short excerpt",
      seoDescription: "Arthur writes a short current-affairs note.",
      bodyZh: "中文正文",
      bodyEn: "English body",
      tagIds: [],
      coverImagePath: null,
    });

    const reloaded = getArticleById(article.id, { includeDraft: true });

    expect(reloaded?.status).toBe("draft");
    expect(reloaded?.bodyZh).toBe("中文正文");
    expect(reloaded?.bodyEn).toBe("English body");
    expect(fs.existsSync(path.join(tmpDir, "markdown", "0.zh.md"))).toBe(false);
  });

  it("publishes one featured article at a time", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle, setFeaturedArticle, listPublishedArticles } = await import("@/lib/services/articles");
    migrate();

    const first = createArticle({
      titleZh: "第一篇",
      titleEn: null,
      slug: "first",
      category: "society",
      excerptZh: "摘要",
      excerptEn: null,
      seoDescription: "第一篇摘要",
      bodyZh: "正文",
      bodyEn: null,
      tagIds: [],
      coverImagePath: null,
    });
    const second = createArticle({
      titleZh: "第二篇",
      titleEn: null,
      slug: "second",
      category: "misc",
      excerptZh: "摘要",
      excerptEn: null,
      seoDescription: "第二篇摘要",
      bodyZh: "正文",
      bodyEn: null,
      tagIds: [],
      coverImagePath: null,
    });

    publishArticle(first.id);
    publishArticle(second.id);
    setFeaturedArticle(second.id);

    const published = listPublishedArticles();
    expect(published.filter((article) => article.isFeatured)).toHaveLength(1);
    expect(published.find((article) => article.isFeatured)?.id).toBe(second.id);
  });
});
