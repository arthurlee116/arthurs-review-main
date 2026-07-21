import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  it("bounds raw Unicode input and FTS prefix tokens on the server", async () => {
    const { MAX_SEARCH_CODE_POINTS, MAX_SEARCH_TOKENS, buildFtsQuery, normalizeSearchQuery } = await import("@/lib/services/search");
    const raw = `${"😀".repeat(MAX_SEARCH_CODE_POINTS + 5)} ignored`;
    const normalized = normalizeSearchQuery(raw);

    expect(Array.from(normalized)).toHaveLength(MAX_SEARCH_CODE_POINTS);
    const fts = buildFtsQuery(Array.from({ length: MAX_SEARCH_TOKENS + 8 }, (_, index) => `t${index}`).join(" "));
    expect(fts.split(" ")).toHaveLength(MAX_SEARCH_TOKENS);
    expect(fts).not.toContain(`t${MAX_SEARCH_TOKENS}`);
  });

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
    const { rebuildArticleSearchWithShadow } = await import("@/lib/db/migrate");
    getDb().transaction(() => rebuildArticleSearchWithShadow(getDb())).immediate();

    const results = searchArticles("contentless");
    expect(results.map((article) => article.slug)).toEqual(["old-fts-migration"]);
  });

  it("returns highlighted snippet parts for public search results", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticleResults } = await import("@/lib/services/search");
    migrate();

    const published = createArticle(
      articleInput({
        titleZh: "城市旁观者",
        slug: "highlighted-bystander",
        category: "society",
        excerptZh: "城市如何塑造沉默",
        seoDescription: "城市分析",
        bodyZh: "地铁、租房和旁观者心态，让人学会保持距离。",
      }),
    );
    publishArticle(published.id);

    const page = searchArticleResults("旁观者");
    expect(page.total).toBe(1);
    expect(page.page).toBe(1);
    expect(page.totalPages).toBe(1);
    expect(page.results[0].article.slug).toBe("highlighted-bystander");
    expect(page.results[0].excerptParts).toContainEqual({ text: "旁观者", highlighted: true });
    expect(page.results[0].excerptParts.map((part) => part.text).join("")).toContain("旁观者");
  });

  it("paginates public search results with stable ordering", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticleResults } = await import("@/lib/services/search");
    migrate();

    for (let index = 1; index <= 12; index += 1) {
      const article = createArticle(
        articleInput({
          titleZh: `共同词文章 ${index}`,
          slug: `shared-term-${index}`,
          category: "society",
          excerptZh: `共同词摘要 ${index}`,
          seoDescription: `共同词 SEO ${index}`,
          bodyZh: `共同词正文 ${index}`,
        }),
      );
      publishArticle(article.id);
    }

    const page = searchArticleResults("共同词", { page: 2, pageSize: 5 });
    expect(page.total).toBe(12);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(5);
    expect(page.totalPages).toBe(3);
    expect(page.hasPreviousPage).toBe(true);
    expect(page.hasNextPage).toBe(true);
    expect(page.results.map((result) => result.article.slug)).toEqual([
      "shared-term-7",
      "shared-term-6",
      "shared-term-5",
      "shared-term-4",
      "shared-term-3",
    ]);
  });

  it("clamps invalid and out-of-range public search pages", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticleResults } = await import("@/lib/services/search");
    migrate();

    const article = createArticle(
      articleInput({
        titleZh: "只有一页",
        slug: "single-search-page",
        category: "society",
        excerptZh: "唯一结果",
        seoDescription: "唯一结果",
        bodyZh: "唯一结果",
      }),
    );
    publishArticle(article.id);

    expect(searchArticleResults("唯一结果", { page: -3 }).page).toBe(1);
    expect(searchArticleResults("唯一结果", { page: 99 }).page).toBe(1);
    expect(searchArticleResults("   ", { page: 5 })).toMatchObject({
      page: 1,
      total: 0,
      totalPages: 0,
      results: [],
      hasPreviousPage: false,
      hasNextPage: false,
    });
    expect(searchArticleResults("!!!", { page: 5 })).toMatchObject({
      page: 1,
      total: 0,
      totalPages: 0,
      results: [],
      hasPreviousPage: false,
      hasNextPage: false,
    });
  });

  it("batch-loads tags once for a page of search results", async () => {
    const { migrate } = await import("@/lib/db/migrate");
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { searchArticleResults } = await import("@/lib/services/search");
    migrate();
    for (let index = 1; index <= 4; index += 1) {
      publishArticle(createArticle(articleInput({ titleZh: `批量标签 ${index}`, slug: `batch-tags-${index}`, bodyZh: "批量标签关键词" })).id);
    }
    const prepare = vi.spyOn(getDb(), "prepare");

    expect(searchArticleResults("批量标签关键词").results).toHaveLength(4);

    const tagQueries = prepare.mock.calls.filter(([sql]) => String(sql).includes("join article_revision_tags"));
    expect(tagQueries).toHaveLength(1);
    prepare.mockRestore();
  });
});
