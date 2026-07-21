import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-url-history-"));
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

describe("published article URL history", () => {
  it("redirects every old published path to the latest published path", async () => {
    const { createArticle, getArticleUrlRedirect, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const firstDraft = createArticle(articleInput({ slug: "first-path", category: "commentary" }));
    const firstPublished = publishArticle(firstDraft.id);

    const secondDraft = updateArticle(
      firstDraft.id,
      articleInput({ slug: "second-path", category: "society" }),
      firstPublished.draftRevisionId,
    );
    expect(getArticleUrlRedirect("commentary", "first-path")).toBeNull();
    publishArticle(firstDraft.id);
    expect(getArticleUrlRedirect("commentary", "first-path")).toEqual({ category: "society", slug: "second-path" });

    updateArticle(
      firstDraft.id,
      articleInput({ slug: "third-path", category: "misc" }),
      secondDraft.draftRevisionId,
    );
    publishArticle(firstDraft.id);

    expect(getArticleUrlRedirect("commentary", "first-path")).toEqual({ category: "misc", slug: "third-path" });
    expect(getArticleUrlRedirect("society", "second-path")).toEqual({ category: "misc", slug: "third-path" });
  });

  it("does not let another article steal a historical public path", async () => {
    const { createArticle, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const original = publishArticle(createArticle(articleInput({ slug: "reserved-path" })).id);
    updateArticle(original.id, articleInput({ slug: "current-path" }), original.draftRevisionId);
    publishArticle(original.id);

    const intruder = createArticle(articleInput({ titleZh: "另一篇", slug: "reserved-path" }));

    expect(() => publishArticle(intruder.id)).toThrow("A historical article URL already uses this category and slug.");
  });

  it("does not redirect to an unpublished article", async () => {
    const { createArticle, getArticleUrlRedirect, publishArticle, unpublishArticle, updateArticle } = await import("@/lib/services/articles");
    const original = publishArticle(createArticle(articleInput({ slug: "old-public-path" })).id);
    updateArticle(original.id, articleInput({ slug: "new-public-path" }), original.draftRevisionId);
    publishArticle(original.id);
    unpublishArticle(original.id);

    expect(getArticleUrlRedirect("commentary", "old-public-path")).toBeNull();
  });

  it("turns an old public page request into a permanent redirect", async () => {
    const { ArticlePage } = await import("@/app/_articlePage");
    const { createArticle, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const original = publishArticle(createArticle(articleInput({ slug: "page-old-path" })).id);
    updateArticle(original.id, articleInput({ slug: "page-new-path", category: "society" }), original.draftRevisionId);
    publishArticle(original.id);

    await expect(ArticlePage({ category: "commentary", slug: "page-old-path", lang: "en" })).rejects.toMatchObject({
      digest: expect.stringContaining("/society/page-new-path?lang=en"),
    });
  });
});
