import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(fullPrompt).toContain("Do not soften political judgments");
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
