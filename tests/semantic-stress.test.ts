import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { articleInput } from "@/test/factories";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-semantic-stress-"));
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

describe("semantic stress corpus", () => {
  it("requires both an explicit confirmation and an isolated-data marker", async () => {
    const { assertSemanticStressDirectory, SEMANTIC_STRESS_MARKER } = await import("@/lib/semantic/stress");

    expect(() => assertSemanticStressDirectory(tmpDir, false)).toThrow("--confirm-isolated");
    expect(() => assertSemanticStressDirectory(tmpDir, true)).toThrow(SEMANTIC_STRESS_MARKER);

    fs.writeFileSync(path.join(tmpDir, SEMANTIC_STRESS_MARKER), "isolated benchmark only\n");
    expect(() => assertSemanticStressDirectory(tmpDir, true)).not.toThrow();
  });

  it("clones published revisions to an exact target while reusing immutable markdown and rebuilding FTS", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const { clonePublishedArticlesForStress } = await import("@/lib/semantic/stress");
    const { searchArticleResults } = await import("@/lib/services/search");

    publishArticle(
      createArticle(articleInput({ slug: "source-one", titleZh: "苹果与人的选择", bodyZh: "稀有词青金石只在第一篇出现。" })).id,
    );
    publishArticle(
      createArticle(articleInput({ slug: "source-two", titleZh: "城市观察", bodyZh: "第二篇谈城市生活。" })).id,
    );

    const result = clonePublishedArticlesForStress(7);

    expect(result).toEqual({ sourceArticleCount: 2, createdArticleCount: 5, totalArticleCount: 7 });
    expect(
      getDb()
        .prepare(
          `select count(*) as count
           from articles
           where published_revision_id is not null`,
        )
        .get(),
    ).toEqual({ count: 7 });
    expect(
      getDb()
        .prepare(
          `select count(*) as count
           from article_revisions
           where slug like 'semantic-stress-%'`,
        )
        .get(),
    ).toEqual({ count: 5 });
    expect(
      getDb()
        .prepare(
          `select count(distinct body_zh_path) as count
           from article_revisions
           where article_id in (select id from articles where published_revision_id is not null)`,
        )
        .get(),
    ).toEqual({ count: 2 });
    expect(searchArticleResults("青金石", { pageSize: 100 }).total).toBe(4);
  });

  it("refuses to amplify an already generated stress corpus", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { clonePublishedArticlesForStress } = await import("@/lib/semantic/stress");
    publishArticle(createArticle(articleInput({ slug: "only-source" })).id);

    clonePublishedArticlesForStress(3);
    expect(() => clonePublishedArticlesForStress(5)).toThrow("fresh isolated copy");
  });
});
