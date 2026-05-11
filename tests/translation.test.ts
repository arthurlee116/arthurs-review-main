import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";

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

  it("batch translates published missing-English articles and records a retry failure", async () => {
    await setupDb();
    const { createArticle, getArticleById, publishArticle } = await import("@/lib/services/articles");
    const { translatePublishedMissingEnglish } = await import("@/lib/translation/service");
    const first = createArticle(articleInput({ slug: "first", titleZh: "第一篇", titleEn: null, excerptEn: null, bodyEn: null }));
    const second = createArticle(articleInput({ slug: "second", titleZh: "第二篇", titleEn: null, excerptEn: null, bodyEn: null }));
    publishArticle(first.id);
    publishArticle(second.id);
    const calls: string[] = [];

    const result = await translatePublishedMissingEnglish({
      model: "inclusionai/ring-2.6-1t:free",
      translate: async (input) => {
        calls.push(input.titleZh);
        if (input.titleZh === "第二篇") throw new Error("model exploded");
        return {
          titleEn: `${input.titleZh} EN`,
          excerptEn: `${input.excerptZh} EN`,
          bodyEn: `${input.bodyZh} EN`,
        };
      },
    });

    expect(result.summary).toEqual({ attempted: 2, succeeded: 1, failed: 1 });
    expect(result.successes).toEqual([{ id: first.id, titleZh: "第一篇" }]);
    expect(result.failures).toEqual([{ id: second.id, titleZh: "第二篇", error: "model exploded" }]);
    expect(calls).toEqual(["第二篇", "第二篇", "第一篇"]);
    expect(getArticleById(first.id, { includeDraft: true })?.titleEn).toBe("第一篇 EN");
    expect(getArticleById(second.id, { includeDraft: true })?.titleEn).toBeNull();
  });
});
