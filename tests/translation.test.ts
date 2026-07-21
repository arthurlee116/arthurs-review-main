import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";

vi.mock("@/app/studio/api/_helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/studio/api/_helpers")>()),
  requireApiAdmin: vi.fn(async () => null),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.SITE_URL;
});

describe("translation schema and prompt", () => {
  it("validates complete translated output", async () => {
    const { TranslationOutputSchema } = await import("@/lib/translation/schema");

    expect(
      TranslationOutputSchema.parse({
        titleEn: "Morality and Reason",
        excerptEn: "Where do all these villains come from?",
        bodyEn: "A clear English body.",
      }),
    ).toEqual({
      titleEn: "Morality and Reason",
      excerptEn: "Where do all these villains come from?",
      bodyEn: "A clear English body.",
    });
  });

  it("rejects incomplete translated output", async () => {
    const { TranslationOutputSchema } = await import("@/lib/translation/schema");

    expect(() => TranslationOutputSchema.parse({ titleEn: "Only a title" })).toThrow();
  });

  it("builds a style-specific prompt with all Chinese fields", async () => {
    const { buildTranslationMessages } = await import("@/lib/translation/prompt");
    const messages = buildTranslationMessages({
      titleZh: "道德与理性",
      excerptZh: "哪里来那么多坏人",
      bodyZh: "我想从马克思和恩格斯谈起。",
    });

    const fullPrompt = messages.map((message) => message.content).join("\n");

    expect(fullPrompt).toContain("Arthur's Review");
    expect(fullPrompt).toContain("Preserve force before elegance");
    expect(fullPrompt).toContain("Do not choose the statistically laziest English editorial phrase");
    expect(fullPrompt).toContain("Do not guess first names, affiliations, relationships, or identities");
    expect(fullPrompt).toContain("A broad essay title may need 'Reason' rather than 'Rationality'");
    expect(fullPrompt).toContain("Do not add headings, subtitles, 'Excerpt:', summaries, horizontal rules");
    expect(fullPrompt).toContain("Do not turn it into formal journalism");
    expect(fullPrompt).toContain("道德与理性");
    expect(fullPrompt).toContain("哪里来那么多坏人");
    expect(fullPrompt).toContain("我想从马克思和恩格斯谈起。");
  });
});

describe("OpenRouter translation client", () => {
  it("calls chat completions and parses structured JSON content", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.SITE_URL = "https://blog.leesaitool.com";
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "gen-1",
        model: "inclusionai/ring-2.6-1t:free",
        choices: [
          {
            message: {
              content: JSON.stringify({
                titleEn: "Morality and Reason",
                excerptEn: "Where do all these villains come from?",
                bodyEn: "English body.",
              }),
            },
          },
        ],
        usage: { total_tokens: 123 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { requestOpenRouterTranslation } = await import("@/lib/translation/openrouter");

    await expect(
      requestOpenRouterTranslation({
        model: "inclusionai/ring-2.6-1t:free",
        messages: [{ role: "user", content: "Translate." }],
      }),
    ).resolves.toEqual({
      titleEn: "Morality and Reason",
      excerptEn: "Where do all these villains come from?",
      bodyEn: "English body.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "HTTP-Referer": "https://blog.leesaitool.com",
          "X-OpenRouter-Title": "Arthur's Review",
        }),
      }),
    );
  });

  it("returns a clear error when the API key is missing", async () => {
    const { requestOpenRouterTranslation } = await import("@/lib/translation/openrouter");

    await expect(
      requestOpenRouterTranslation({
        model: "inclusionai/ring-2.6-1t:free",
        messages: [{ role: "user", content: "Translate." }],
      }),
    ).rejects.toThrow("OPENROUTER_API_KEY is not configured.");
  });

  it("rejects non-2xx OpenRouter responses", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "rate limited" } }, { status: 429 })),
    );
    const { requestOpenRouterTranslation } = await import("@/lib/translation/openrouter");

    await expect(
      requestOpenRouterTranslation({
        model: "inclusionai/ring-2.6-1t:free",
        messages: [{ role: "user", content: "Translate." }],
      }),
    ).rejects.toThrow("OpenRouter request failed with status 429.");
  });

  it("rejects invalid JSON content", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: "not json" } }],
        }),
      ),
    );
    const { requestOpenRouterTranslation } = await import("@/lib/translation/openrouter");

    await expect(
      requestOpenRouterTranslation({
        model: "inclusionai/ring-2.6-1t:free",
        messages: [{ role: "user", content: "Translate." }],
      }),
    ).rejects.toThrow("OpenRouter returned invalid JSON.");
  });
});

let tmpDir: string | undefined;

async function setupDb(prefix = "arthurs-review-translation-") {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "http://localhost:3000";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
  process.env.SESSION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  const { migrate } = await import("@/lib/db/migrate");
  migrate();
}

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

describe("translation article service", () => {
  it("lists only published articles missing any English field", async () => {
    await setupDb();
    const { createArticle, listPublishedArticlesMissingEnglish, publishArticle } = await import("@/lib/services/articles");

    const complete = createArticle(
      articleInput({
        slug: "complete",
        titleEn: "Complete",
        excerptEn: "Complete excerpt",
        bodyEn: "Complete body",
      }),
    );
    publishArticle(complete.id);
    const missingTitle = createArticle(
      articleInput({
        slug: "missing-title",
        titleEn: null,
        excerptEn: "English excerpt",
        bodyEn: "English body",
      }),
    );
    publishArticle(missingTitle.id);
    const missingBody = createArticle(
      articleInput({
        slug: "missing-body",
        titleEn: "English title",
        excerptEn: "English excerpt",
        bodyEn: null,
      }),
    );
    publishArticle(missingBody.id);
    createArticle(
      articleInput({
        slug: "draft-missing",
        titleEn: null,
        excerptEn: null,
        bodyEn: null,
      }),
    );

    expect(listPublishedArticlesMissingEnglish().map((article) => article.slug)).toEqual(["missing-body", "missing-title"]);
  });

  it("updates English title, excerpt, and body together", async () => {
    await setupDb();
    const { createArticle, getArticleById, updateArticleEnglishFields } = await import("@/lib/services/articles");
    const article = createArticle(articleInput({ slug: "needs-english", titleEn: null, excerptEn: null, bodyEn: null }));

    updateArticleEnglishFields(article.id, {
      titleEn: "English title",
      excerptEn: "English excerpt",
      bodyEn: "English body",
    });

    expect(getArticleById(article.id, { includeDraft: true })).toMatchObject({
      titleEn: "English title",
      excerptEn: "English excerpt",
      bodyEn: "English body",
    });
  });

  it("returns 202 after durably queuing one exact-revision job per article", async () => {
    await setupDb();
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, publishArticle } = await import("@/lib/services/articles");
    const first = createArticle(articleInput({ slug: "first", titleZh: "第一篇", titleEn: null, excerptEn: null, bodyEn: null }));
    const second = createArticle(articleInput({ slug: "second", titleZh: "第二篇", titleEn: null, excerptEn: null, bodyEn: null }));
    const firstPublished = publishArticle(first.id);
    const secondPublished = publishArticle(second.id);
    getDb().prepare("delete from jobs").run();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const route = await import("@/app/studio/api/translations/published-missing/route");

    const response = await route.POST(new Request("http://localhost/studio/api/translations/published-missing", { method: "POST" }));
    const body = await response.json() as { batch: { id: string; total: number; queued: number; running: number; succeeded: number; dead: number } };

    expect(response.status).toBe(202);
    expect(body.batch).toMatchObject({ id: expect.any(String), total: 2, queued: 2, running: 0, succeeded: 0, dead: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    const jobs = getDb().prepare("select payload from jobs where type = 'translation.article' order by id").all() as Array<{ payload: string }>;
    expect(jobs.map((row) => JSON.parse(row.payload))).toEqual([
      expect.objectContaining({ batchId: body.batch.id, articleId: second.id, sourceRevisionId: secondPublished.revisionId }),
      expect.objectContaining({ batchId: body.batch.id, articleId: first.id, sourceRevisionId: firstPublished.revisionId }),
    ]);
    const progressResponse = await route.GET(
      new Request(`http://localhost/studio/api/translations/published-missing?batch=${body.batch.id}`),
    );
    await expect(progressResponse.json()).resolves.toEqual({ batch: body.batch });
  });

  it("publishes a translated revision and durable proof/cache work exactly once", async () => {
    await setupDb();
    process.env.OPENROUTER_API_KEY = "test-key";
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, getArticleById, getPublishedArticle, publishArticle } = await import("@/lib/services/articles");
    const source = publishArticle(createArticle(articleInput({ titleZh: "待翻译", bodyZh: "中文源文" })).id);
    getDb().prepare("delete from jobs").run();
    const { enqueuePublishedMissingEnglishTranslations, getTranslationBatchProgress } = await import("@/lib/translation/service");
    const batch = enqueuePublishedMissingEnglishTranslations({ model: "test-model" });
    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify({ titleEn: "Translated", excerptEn: "English excerpt", bodyEn: "English body" }) } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createJobHandlers } = await import("@/lib/jobs/handlers");
    const { getJob, runNextJob } = await import("@/lib/jobs/queue");
    const handlers = createJobHandlers();
    const completed = await runNextJob({ workerId: "translator", handlers, baseDelayMs: 0 });

    expect(completed).toMatchObject({ type: "translation.article", status: "succeeded" });
    expect(getTranslationBatchProgress(batch.id)).toMatchObject({ total: 1, queued: 0, running: 0, succeeded: 1, dead: 0 });
    expect(getPublishedArticle("commentary", source.slug)).toMatchObject({
      titleZh: "待翻译",
      titleEn: "Translated",
      bodyZh: "中文源文",
      bodyEn: "English body",
    });
    expect(getArticleById(source.id, { includeDraft: true })?.titleEn).toBe("Translated");
    expect(getDb().prepare("select count(*) as count from article_revisions where article_id = ?").get(source.id)).toEqual({ count: 2 });
    expect(getDb().prepare("select type from jobs where type in ('proof.create', 'cache.invalidate') order by id").all()).toEqual([
      { type: "proof.create" },
      { type: "cache.invalidate" },
    ]);

    await handlers["translation.article"]!(getJob(completed!.id)!);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getDb().prepare("select count(*) as count from article_revisions where article_id = ?").get(source.id)).toEqual({ count: 2 });
  });

  it("keeps a newer manual draft while translating the still-current published revision", async () => {
    await setupDb();
    process.env.OPENROUTER_API_KEY = "test-key";
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, getArticleById, getPublishedArticle, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const source = publishArticle(createArticle(articleInput({ titleZh: "线上中文", bodyZh: "线上正文" })).id);
    getDb().prepare("delete from jobs").run();
    const manualDraft = updateArticle(
      source.id,
      articleInput({ titleZh: "人工新草稿", bodyZh: "人工新正文" }),
      source.draftRevisionId,
    );
    const { enqueuePublishedMissingEnglishTranslations } = await import("@/lib/translation/service");
    enqueuePublishedMissingEnglishTranslations({ model: "test-model" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ choices: [{ message: { content: JSON.stringify({ titleEn: "Online English", excerptEn: "Excerpt", bodyEn: "Body" }) } }] }),
      ),
    );
    const { createJobHandlers } = await import("@/lib/jobs/handlers");
    const { runNextJob } = await import("@/lib/jobs/queue");

    await runNextJob({ workerId: "translator", handlers: createJobHandlers(), baseDelayMs: 0 });

    expect(getArticleById(source.id, { includeDraft: true })).toMatchObject({
      revisionId: manualDraft.revisionId,
      titleZh: "人工新草稿",
      titleEn: null,
      bodyZh: "人工新正文",
    });
    expect(getPublishedArticle("commentary", source.slug)).toMatchObject({
      titleZh: "线上中文",
      titleEn: "Online English",
      bodyZh: "线上正文",
      bodyEn: "Body",
    });
  });

  it("completes an obsolete job without calling the model or overwriting a newer publish", async () => {
    await setupDb();
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, getPublishedArticle, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const source = publishArticle(createArticle(articleInput({ titleZh: "旧发布" })).id);
    getDb().prepare("delete from jobs").run();
    const { enqueuePublishedMissingEnglishTranslations, getTranslationBatchProgress } = await import("@/lib/translation/service");
    const batch = enqueuePublishedMissingEnglishTranslations({ model: "test-model" });
    updateArticle(source.id, articleInput({ titleZh: "新发布" }), source.draftRevisionId);
    const newer = publishArticle(source.id);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { createJobHandlers } = await import("@/lib/jobs/handlers");
    const { runNextJob } = await import("@/lib/jobs/queue");

    await runNextJob({ workerId: "translator", handlers: createJobHandlers(), baseDelayMs: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getTranslationBatchProgress(batch.id)).toMatchObject({ succeeded: 1, dead: 0 });
    expect(getPublishedArticle("commentary", newer.slug)).toMatchObject({ revisionId: newer.revisionId, titleZh: "新发布", titleEn: null });
  });

  it("rechecks the published pointer after an in-flight model call", async () => {
    await setupDb();
    const { createArticle, getPublishedArticle, publishArticle, updateArticle } = await import("@/lib/services/articles");
    const source = publishArticle(createArticle(articleInput({ titleZh: "模型调用前" })).id);
    let release!: (value: { titleEn: string; excerptEn: string; bodyEn: string }) => void;
    const translate = vi.fn(() => new Promise<{ titleEn: string; excerptEn: string; bodyEn: string }>((resolve) => { release = resolve; }));
    const { translatePublishedRevision } = await import("@/lib/translation/service");
    const running = translatePublishedRevision({ articleId: source.id, sourceRevisionId: source.revisionId, model: "test-model", translate });
    await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce());

    updateArticle(source.id, articleInput({ titleZh: "模型调用期间的新版本" }), source.draftRevisionId);
    const newer = publishArticle(source.id);
    release({ titleEn: "Stale English", excerptEn: "Stale excerpt", bodyEn: "Stale body" });

    await expect(running).resolves.toEqual({ status: "obsolete" });
    expect(getPublishedArticle("commentary", newer.slug)).toMatchObject({ revisionId: newer.revisionId, titleZh: "模型调用期间的新版本", titleEn: null });
  });

  it("rolls the translated revision back when its outbox insert fails", async () => {
    await setupDb();
    const { getDb } = await import("@/lib/db/connection");
    const { createArticle, getPublishedArticle, publishArticle } = await import("@/lib/services/articles");
    const source = publishArticle(createArticle(articleInput({ titleZh: "事务源版本" })).id);
    const db = getDb();
    db.prepare("delete from jobs").run();
    db.exec(`
      create trigger reject_translation_proof_job
      before insert on jobs
      when new.type = 'proof.create'
      begin
        select raise(abort, 'translation outbox unavailable');
      end
    `);
    const { translatePublishedRevision } = await import("@/lib/translation/service");

    await expect(
      translatePublishedRevision({
        articleId: source.id,
        sourceRevisionId: source.revisionId,
        model: "test-model",
        translate: async () => ({ titleEn: "English", excerptEn: "Excerpt", bodyEn: "Body" }),
      }),
    ).rejects.toThrow("translation outbox unavailable");

    expect(getPublishedArticle("commentary", source.slug)).toMatchObject({ revisionId: source.revisionId, titleEn: null });
    expect(db.prepare("select count(*) as count from article_revisions where article_id = ?").get(source.id)).toEqual({ count: 1 });
    expect(fs.readdirSync(path.join(tmpDir!, "markdown")).filter((name) => name.includes(".en."))).toEqual([]);
  });
});
