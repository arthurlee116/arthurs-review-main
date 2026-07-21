import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";

vi.mock("@/app/studio/api/_helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/studio/api/_helpers")>()),
  requireApiAdmin: vi.fn(async () => null),
}));

vi.mock("@/lib/translation/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/translation/service")>()),
  translatePublishedMissingEnglish: vi.fn(),
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-proof-triggers-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "https://blog.leesaitool.com";
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

describe("publication-proof mutation triggers", () => {
  it("runs only when Publish switches the public revision", async () => {
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle } = await import("@/lib/services/articles");
    const article = createArticle(articleInput());
    const updateRoute = await import("@/app/studio/api/articles/[id]/route");
    const publishRoute = await import("@/app/studio/api/articles/[id]/publish/route");
    const context = { params: Promise.resolve({ id: String(article.id) }) };

    const firstSave = await updateRoute.PUT(
      new Request("http://localhost/studio/api/articles/1", {
        method: "PUT",
        body: JSON.stringify({ ...articleInput({ bodyZh: "草稿修改" }), expectedDraftRevisionId: article.draftRevisionId }),
      }),
      context,
    );
    const firstSavedArticle = (await firstSave.json() as { article: { draftRevisionId: number } }).article;
    expect(getDb().prepare("select count(*) as count from jobs").get()).toEqual({ count: 0 });

    await publishRoute.POST(new Request("http://localhost/studio/api/articles/1/publish", { method: "POST" }), context);
    expect(getDb().prepare("select type from jobs order by id").all()).toEqual([
      { type: "proof.create" },
      { type: "cache.invalidate" },
    ]);

    await updateRoute.PUT(
      new Request("http://localhost/studio/api/articles/1", {
        method: "PUT",
        body: JSON.stringify({ ...articleInput({ bodyZh: "发布后修改" }), expectedDraftRevisionId: firstSavedArticle.draftRevisionId }),
      }),
      context,
    );
    expect(getDb().prepare("select count(*) as count from jobs").get()).toEqual({ count: 2 });

    await publishRoute.POST(new Request("http://localhost/studio/api/articles/1/publish", { method: "POST" }), context);
    const proofJobs = getDb().prepare("select payload from jobs where type = 'proof.create' order by id").all() as Array<{ payload: string }>;
    expect(proofJobs.map((job) => JSON.parse(job.payload).revisionId)).toEqual([
      firstSavedArticle.draftRevisionId,
      expect.any(Number),
    ]);
    expect(new Set(proofJobs.map((job) => JSON.parse(job.payload).revisionId)).size).toBe(2);
  });

  it("does not create a public proof when batch translation only saves a draft", async () => {
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const { getDb } = await import("@/lib/db/connection");
    const { translatePublishedMissingEnglish } = await import("@/lib/translation/service");
    const article = publishArticle(createArticle(articleInput()).id);
    vi.mocked(translatePublishedMissingEnglish).mockResolvedValue({
      summary: { attempted: 1, succeeded: 1, failed: 0 },
      successes: [{ id: article.id, titleZh: article.titleZh }],
      failures: [],
    });
    const route = await import("@/app/studio/api/translations/published-missing/route");

    await route.POST(new Request("http://localhost/studio/api/translations/published-missing", { method: "POST" }));

    expect(getDb().prepare("select count(*) as count from jobs where type = 'proof.create'").get()).toEqual({ count: 1 });
  });
});
