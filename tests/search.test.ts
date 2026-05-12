import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-search-"));
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

describe("keyword search", () => {
  it("finds published articles by body text and ignores drafts", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticles } = await import("@/lib/services/search");
    migrate();

    const published = createArticle(
      articleInput({
        titleZh: "城市旁观者",
        slug: "city-bystander",
        category: "society",
        excerptZh: "城市如何塑造沉默",
        seoDescription: "城市分析",
        bodyZh: "地铁、租房和旁观者心态",
      }),
    );
    createArticle(
      articleInput({
        titleZh: "草稿文章",
        slug: "draft-only",
        category: "society",
        excerptZh: "旁观者",
        seoDescription: "草稿",
        bodyZh: "旁观者",
      }),
    );

    publishArticle(published.id);

    const results = searchArticles("旁观者");
    expect(results.map((article) => article.slug)).toEqual(["city-bystander"]);
  });

  it("keeps the FTS index when migrate runs again", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticles } = await import("@/lib/services/search");
    migrate();

    const published = createArticle(
      articleInput({
        titleZh: "迁移后的搜索",
        slug: "search-after-migrate",
        category: "society",
        excerptZh: "索引不应该被清空",
        seoDescription: "迁移搜索",
        bodyZh: "二次迁移之后仍然能搜到这篇文章",
      }),
    );
    publishArticle(published.id);

    migrate();

    const results = searchArticles("二次迁移");
    expect(results.map((article) => article.slug)).toEqual(["search-after-migrate"]);
  });

  it("migrates the old contentless FTS table and rebuilds published article rows", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticles } = await import("@/lib/services/search");
    migrate();

    const published = createArticle(
      articleInput({
        titleZh: "旧索引迁移",
        slug: "old-fts-migration",
        category: "society",
        excerptZh: "旧表需要重建",
        seoDescription: "旧索引迁移",
        bodyZh: "contentless 表迁移后仍然能搜到",
      }),
    );
    publishArticle(published.id);

    getDb().exec(`
      drop table article_search;
      create virtual table article_search using fts5(
        title_zh,
        title_en,
        excerpt_zh,
        excerpt_en,
        body_zh,
        body_en,
        category,
        tags,
        content='',
        tokenize='unicode61'
      );
    `);
    migrate();

    const results = searchArticles("contentless");
    expect(results.map((article) => article.slug)).toEqual(["old-fts-migration"]);
  });
});
