import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-revisions-"));
  process.env.DATA_DIR = tmpDir;
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  const { migrate } = await import("@/lib/db/migrate");
  migrate();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("immutable article revisions", () => {
  it("keeps a published revision live until Publish switches the pointer", async () => {
    const { createArticle, getArticleById, getPublishedArticle, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const { searchArticles } = await import("@/lib/services/search");
    const draft = createArticle(
      articleInput({
        titleZh: "线上旧标题",
        slug: "published-pointer",
        bodyZh: "线上旧正文 独有旧词",
      }),
    );
    const published = publishArticle(draft.id);

    const savedDraft = updateArticle(
      published.id,
      articleInput({
        titleZh: "尚未发布的新标题",
        slug: "unpublished-pointer",
        bodyZh: "尚未发布的新正文 独有新词",
      }),
      published.draftRevisionId,
    );

    expect(savedDraft.status).toBe("published");
    expect(savedDraft.draftRevisionId).not.toBe(savedDraft.publishedRevisionId);
    expect(getPublishedArticle("commentary", "published-pointer")).toMatchObject({
      titleZh: "线上旧标题",
      bodyZh: "线上旧正文 独有旧词",
    });
    expect(getPublishedArticle("commentary", "unpublished-pointer")).toBeNull();
    expect(searchArticles("独有旧词").map((article) => article.id)).toEqual([published.id]);
    expect(searchArticles("独有新词")).toEqual([]);
    expect(getArticleById(published.id, { includeDraft: true })).toMatchObject({
      titleZh: "尚未发布的新标题",
      bodyZh: "尚未发布的新正文 独有新词",
    });

    const republished = publishArticle(published.id);

    expect(republished.draftRevisionId).toBe(republished.publishedRevisionId);
    expect(getPublishedArticle("commentary", "published-pointer")).toBeNull();
    expect(getPublishedArticle("commentary", "unpublished-pointer")).toMatchObject({
      titleZh: "尚未发布的新标题",
      bodyZh: "尚未发布的新正文 独有新词",
    });
    expect(searchArticles("独有旧词")).toEqual([]);
    expect(searchArticles("独有新词").map((article) => article.id)).toEqual([published.id]);
  });

  it("rejects a stale draft pointer instead of overwriting another tab", async () => {
    const { ArticleRevisionConflictError, createArticle, getArticleById, updateArticle } = await import("@/lib/services/articles");
    const original = createArticle(articleInput({ titleZh: "原始标题", slug: "optimistic-lock" }));

    updateArticle(
      original.id,
      articleInput({ titleZh: "第一个标签页", slug: "optimistic-lock" }),
      original.draftRevisionId,
    );

    expect(() =>
      updateArticle(
        original.id,
        articleInput({ titleZh: "第二个标签页", slug: "optimistic-lock" }),
        original.draftRevisionId,
      ),
    ).toThrow(ArticleRevisionConflictError);
    expect(getArticleById(original.id, { includeDraft: true })?.titleZh).toBe("第一个标签页");
  });

  it("keeps the latest draft when an article is unpublished", async () => {
    const { createArticle, getArticleById, getPublishedArticle, publishArticle, unpublishArticle, updateArticle } = await import("@/lib/services/articles");
    const draft = createArticle(articleInput({ titleZh: "线上版本", slug: "unpublish-draft" }));
    const published = publishArticle(draft.id);
    updateArticle(
      draft.id,
      articleInput({ titleZh: "保留的草稿", slug: "unpublish-draft" }),
      published.draftRevisionId,
    );

    const unpublished = unpublishArticle(draft.id);

    expect(unpublished).toMatchObject({ status: "draft", titleZh: "保留的草稿" });
    expect(getArticleById(draft.id, { includeDraft: true })?.titleZh).toBe("保留的草稿");
    expect(getPublishedArticle("commentary", "unpublish-draft")).toBeNull();
  });
});
