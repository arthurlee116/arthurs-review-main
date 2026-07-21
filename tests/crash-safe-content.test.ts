import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-crash-safe-"));
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

describe("crash-safe article bodies", () => {
  it("keeps the previous body when an article update transaction fails", async () => {
    const { createArticle, getArticleById, updateArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const original = createArticle(articleInput({ slug: "original", bodyZh: "old body" }));
    getDb().exec("create trigger block_revision_insert before insert on article_revisions begin select raise(abort, 'blocked'); end");

    expect(() => updateArticle(original.id, articleInput({ slug: "changed", bodyZh: "new body" }), original.draftRevisionId)).toThrow("blocked");

    const reloaded = getArticleById(original.id, { includeDraft: true });
    expect(reloaded?.bodyZh).toBe("old body");
    expect(reloaded?.bodyZhPath).toBe(original.bodyZhPath);
  });

  it("commits the database delete before removing body files", async () => {
    const { createArticle, deleteArticle, getArticleById } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const article = createArticle(articleInput({ slug: "cannot-delete", bodyZh: "must survive" }));
    const bodyPath = path.join(tmpDir, article.bodyZhPath);
    getDb().exec("create trigger block_article_delete before delete on articles begin select raise(abort, 'blocked'); end");

    expect(() => deleteArticle(article.id)).toThrow("blocked");
    expect(getArticleById(article.id, { includeDraft: true })?.bodyZh).toBe("must survive");
    expect(fs.existsSync(bodyPath)).toBe(true);
  });

  it("keeps the previous English body when its database update fails", async () => {
    const { createArticle, getArticleById, updateArticleEnglishFields } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const article = createArticle(articleInput({ slug: "english", bodyEn: "old English", titleEn: "Old" }));
    getDb().exec("create trigger block_english_update before update on articles begin select raise(abort, 'blocked'); end");

    expect(() => updateArticleEnglishFields(article.id, { titleEn: "New", excerptEn: "New", bodyEn: "new English" })).toThrow("blocked");
    expect(getArticleById(article.id, { includeDraft: true })?.bodyEn).toBe("old English");
  });

  it("retains body files referenced by immutable revisions", async () => {
    const { createArticle, updateArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const article = createArticle(articleInput({ slug: "versioned", bodyZh: "first version" }));
    const oldPath = path.join(tmpDir, article.bodyZhPath);

    const updated = updateArticle(article.id, articleInput({ slug: "versioned", bodyZh: "second version" }), article.draftRevisionId);

    expect(updated.bodyZhPath).not.toBe(article.bodyZhPath);
    expect(updated.bodyZh).toBe("second version");
    expect(fs.existsSync(oldPath)).toBe(true);
    expect(getDb().prepare("select count(*) as count from article_revisions where article_id = ?").get(article.id)).toEqual({ count: 2 });
    expect(fs.readdirSync(path.join(tmpDir, "markdown")).some((name) => name.includes(".tmp"))).toBe(false);
  });

  it("removes every revision body only after the article delete commits", async () => {
    const { createArticle, deleteArticle, updateArticle } = await import("@/lib/services/articles");
    const article = createArticle(articleInput({ slug: "delete-revisions", bodyZh: "first version" }));
    const updated = updateArticle(
      article.id,
      articleInput({ slug: "delete-revisions", bodyZh: "second version" }),
      article.draftRevisionId,
    );
    const paths = [article.bodyZhPath, updated.bodyZhPath].map((bodyPath) => path.join(tmpDir, bodyPath));

    expect(deleteArticle(article.id)).toBe(true);
    expect(paths.every((bodyPath) => !fs.existsSync(bodyPath))).toBe(true);
  });
});
