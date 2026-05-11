# AI Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenRouter-powered Chinese-to-English translation for Arthur's Review articles, with a single-article Studio editor action and a batch action for published articles missing English.

**Architecture:** Keep OpenRouter and prompt handling in `src/lib/translation/`, keep route handlers thin, and reuse the existing SQLite-plus-Markdown article storage. Single-article translation returns generated fields without saving; batch translation runs server-side, saves successful translations, retries each article once, and returns a summary.

**Tech Stack:** Next.js 16 App Router route handlers, React 19 client components, TypeScript, Zod, better-sqlite3, Vitest, Testing Library, OpenRouter Chat Completions API.

---

## File Structure

- Create `src/lib/translation/schema.ts`: translation input/output schemas, JSON Schema sent to OpenRouter, and typed helpers.
- Create `src/lib/translation/prompt.ts`: system prompt and user prompt builder for Arthur's article translation style.
- Create `src/lib/translation/openrouter.ts`: thin fetch client for OpenRouter chat completions.
- Create `src/lib/translation/service.ts`: app-level translation functions, configured model lookup, batch retry and save workflow.
- Modify `src/lib/services/settings.ts`: add `openrouterTranslationModel` default setting.
- Modify `src/lib/services/articles.ts`: add helpers to find published missing-English articles and update English fields together.
- Create `src/app/studio/api/translations/article/route.ts`: authenticated single-article translation endpoint.
- Create `src/app/studio/api/translations/published-missing/route.ts`: authenticated batch translation endpoint.
- Modify `src/app/studio/api/settings/route.ts`: accept and persist the translation model setting.
- Modify `src/components/studio/SettingsForm.tsx`: expose model setting in Studio Settings.
- Modify `src/components/studio/ArticleEditor.tsx`: add English excerpt field and `Translate to English` action.
- Create `src/components/studio/TranslateMissingEnglishButton.tsx`: client component for the Articles page batch action and summary.
- Modify `src/app/studio/(protected)/articles/page.tsx`: mount the batch button near filters.
- Add tests in `tests/translation.test.ts`, `tests/studio-api.test.ts`, and `tests/editor-components.test.tsx`.

---

### Task 1: Add Translation Model Setting

**Files:**
- Modify: `src/lib/services/settings.ts`
- Modify: `src/app/studio/api/settings/route.ts`
- Modify: `src/components/studio/SettingsForm.tsx`
- Test: `tests/settings.test.ts`

- [ ] **Step 1: Write the failing settings service test**

Append this test to `tests/settings.test.ts` inside the existing `describe("featured article settings", ...)` block or after it:

```ts
it("stores the OpenRouter translation model with a sensible default", async () => {
  const { migrate } = await import("@/lib/db/migrate");
  const { getSetting, setSetting } = await import("@/lib/services/settings");
  migrate();

  expect(getSetting("openrouterTranslationModel")).toBe("inclusionai/ring-2.6-1t:free");

  setSetting("openrouterTranslationModel", "google/gemma-4-31b-it:free");

  expect(getSetting("openrouterTranslationModel")).toBe("google/gemma-4-31b-it:free");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/settings.test.ts
```

Expected: FAIL because `"openrouterTranslationModel"` is not assignable to `SettingKey` or does not exist in the defaults object.

- [ ] **Step 3: Add the setting key**

In `src/lib/services/settings.ts`, change `defaults` to include the new key:

```ts
const defaults = {
  siteName: "Arthur's Review",
  contactEmail: "laoliarthur@outlook.com",
  about:
    "Arthur's Review is a personal publication for current-affairs notes, social analysis, poems, travel writing, and other things worth keeping.",
  featuredArticleId: "",
  rssDescription: "Arthur's Review, a personal intellectual publication.",
  openrouterTranslationModel: "inclusionai/ring-2.6-1t:free",
};
```

- [ ] **Step 4: Update Settings API schema**

In `src/app/studio/api/settings/route.ts`, add `openrouterTranslationModel` to `SettingsSchema`:

```ts
const SettingsSchema = z.object({
  siteName: z.string().min(1),
  contactEmail: z.string().email(),
  about: z.string(),
  featuredArticleId: z.string(),
  rssDescription: z.string(),
  openrouterTranslationModel: z.string().min(1),
});
```

Keep the existing `for (const [key, value] of Object.entries(...))` loop; it will persist the new setting because `SettingKey` now includes it.

- [ ] **Step 5: Add the model field to Settings UI**

In `src/components/studio/SettingsForm.tsx`, update the `Settings` type:

```ts
type Settings = {
  siteName: string;
  contactEmail: string;
  about: string;
  featuredArticleId: string;
  rssDescription: string;
  openrouterTranslationModel: string;
};
```

Then add this label after the existing `rssDescription` input group and before `featuredArticleId`:

```tsx
<label className="grid gap-2">
  openrouterTranslationModel
  <input
    className="border border-[var(--rule)] bg-white p-3"
    value={settings.openrouterTranslationModel}
    onChange={(event) => setSettings({ ...settings, openrouterTranslationModel: event.target.value })}
  />
</label>
```

Because the current code maps `siteName`, `contactEmail`, and `rssDescription`, do not put `openrouterTranslationModel` into that map. Keep it as an explicit field so it can later get help text without making the compact settings loop weird.

- [ ] **Step 6: Run the focused settings test**

Run:

```bash
pnpm test tests/settings.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/services/settings.ts src/app/studio/api/settings/route.ts src/components/studio/SettingsForm.tsx tests/settings.test.ts
git commit -m "feat: add OpenRouter translation model setting"
```

---

### Task 2: Add Translation Schemas, Prompt, and OpenRouter Client

**Files:**
- Create: `src/lib/translation/schema.ts`
- Create: `src/lib/translation/prompt.ts`
- Create: `src/lib/translation/openrouter.ts`
- Test: `tests/translation.test.ts`

- [ ] **Step 1: Write failing schema and prompt tests**

Create `tests/translation.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test tests/translation.test.ts
```

Expected: FAIL because `@/lib/translation/schema` and `@/lib/translation/prompt` do not exist.

- [ ] **Step 3: Implement `schema.ts`**

Create `src/lib/translation/schema.ts`:

```ts
import { z } from "zod";

export const TranslationInputSchema = z.object({
  titleZh: z.string().min(1),
  excerptZh: z.string(),
  bodyZh: z.string().min(1),
});

export const TranslationOutputSchema = z.object({
  titleEn: z.string().min(1),
  excerptEn: z.string(),
  bodyEn: z.string().min(1),
});

export type TranslationInput = z.infer<typeof TranslationInputSchema>;
export type TranslationOutput = z.infer<typeof TranslationOutputSchema>;

export const translationJsonSchema = {
  type: "object",
  properties: {
    titleEn: {
      type: "string",
      description: "Natural English translation of the Chinese title.",
    },
    excerptEn: {
      type: "string",
      description: "Natural English translation of the Chinese takeaway or excerpt.",
    },
    bodyEn: {
      type: "string",
      description: "Natural English Markdown translation of the Chinese body.",
    },
  },
  required: ["titleEn", "excerptEn", "bodyEn"],
  additionalProperties: false,
} as const;
```

- [ ] **Step 4: Implement `prompt.ts`**

Create `src/lib/translation/prompt.ts`:

```ts
import type { TranslationInput } from "./schema";

export type TranslationMessage = {
  role: "system" | "user";
  content: string;
};

const systemPrompt = [
  "You translate Chinese articles from Arthur's Review into English.",
  "Arthur's Review is a personal political and social commentary publication.",
  "Preserve the author's argument, stance, rhetorical pressure, directness, rhythm, and occasional sharpness.",
  "Keep the English natural and clear for an educated English reader.",
  "Do not soften political judgments.",
  "Do not add new claims, examples, citations, hedging, or explanations.",
  "Do not remove claims just because they are sharp.",
  "Preserve Markdown structure, headings, links, blockquotes, lists, emphasis, and paragraph breaks.",
  "Translate mixed English terms such as stereotypes, PTSD, or named works naturally in context.",
  "Avoid machine-translation stiffness.",
  "Avoid polished institutional media copy.",
  "Return only JSON matching the requested schema.",
].join("\n");

export function buildTranslationMessages(input: TranslationInput): TranslationMessage[] {
  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: [
        "Translate this article from Chinese to English.",
        "",
        "<title_zh>",
        input.titleZh,
        "</title_zh>",
        "",
        "<excerpt_zh>",
        input.excerptZh,
        "</excerpt_zh>",
        "",
        "<body_zh_markdown>",
        input.bodyZh,
        "</body_zh_markdown>",
      ].join("\n"),
    },
  ];
}
```

- [ ] **Step 5: Add failing OpenRouter client tests**

Append these tests to `tests/translation.test.ts`:

```ts
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
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "rate limited" } }, { status: 429 })));
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
```

- [ ] **Step 6: Run OpenRouter client tests to verify they fail**

Run:

```bash
pnpm test tests/translation.test.ts
```

Expected: FAIL because `@/lib/translation/openrouter` does not exist.

- [ ] **Step 7: Implement `openrouter.ts`**

Create `src/lib/translation/openrouter.ts`:

```ts
import { z } from "zod";
import { TranslationOutputSchema, translationJsonSchema, type TranslationOutput } from "./schema";
import type { TranslationMessage } from "./prompt";

const OpenRouterResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    }),
  ),
});

export type OpenRouterTranslationRequest = {
  model: string;
  messages: TranslationMessage[];
};

function openRouterKey() {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured.");
  return key;
}

function parseTranslationContent(content: string): TranslationOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenRouter returned invalid JSON.");
  }
  return TranslationOutputSchema.parse(parsed);
}

export async function requestOpenRouterTranslation({ model, messages }: OpenRouterTranslationRequest): Promise<TranslationOutput> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SITE_URL ?? "http://localhost:3000",
      "X-OpenRouter-Title": "Arthur's Review",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "article_translation",
          strict: true,
          schema: translationJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with status ${response.status}.`);
  }

  const data = OpenRouterResponseSchema.parse(await response.json());
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("OpenRouter returned empty content.");
  return parseTranslationContent(content);
}
```

- [ ] **Step 8: Run focused translation tests**

Run:

```bash
pnpm test tests/translation.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/lib/translation tests/translation.test.ts
git commit -m "feat: add OpenRouter translation client"
```

---

### Task 3: Add Article Service Helpers and Batch Translation Service

**Files:**
- Modify: `src/lib/services/articles.ts`
- Create/Modify: `src/lib/translation/service.ts`
- Test: `tests/translation.test.ts`

- [ ] **Step 1: Add failing tests for article helper and batch service**

Update the top import section of `tests/translation.test.ts` so it has these imports:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { articleInput } from "@/test/factories";
```

This replaces the earlier Vitest-only import from Task 2; do not leave a second static import in the middle of the file.

Then append this code to `tests/translation.test.ts`:

```ts

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
```

- [ ] **Step 2: Run tests to verify failures**

Run:

```bash
pnpm test tests/translation.test.ts
```

Expected: FAIL because `listPublishedArticlesMissingEnglish`, `updateArticleEnglishFields`, and `translatePublishedMissingEnglish` do not exist.

- [ ] **Step 3: Add article helpers**

In `src/lib/services/articles.ts`, add this export after `listStudioArticles()`:

```ts
export function listPublishedArticlesMissingEnglish() {
  const rows = getDb()
    .prepare(
      `select * from articles
       where status = ?
       and (title_en is null or title_en = '' or excerpt_en is null or excerpt_en = '' or body_en_path is null or body_en_path = '')
       order by published_at desc, id desc`,
    )
    .all("published") as ArticleRow[];
  return rows.map((row) => withBodies(mapArticle(row)));
}
```

Then add this export after `updateArticle()`:

```ts
export function updateArticleEnglishFields(id: number, input: { titleEn: string; excerptEn: string; bodyEn: string }) {
  const existing = getArticleById(id, { includeDraft: true });
  if (!existing) throw new Error("Article not found.");
  const bodyEnPath = writeMarkdownBody(id, "en", input.bodyEn);
  getDb()
    .prepare("update articles set title_en = ?, excerpt_en = ?, body_en_path = ?, updated_at = ? where id = ?")
    .run(input.titleEn, input.excerptEn, bodyEnPath, nowIso(), id);
  return getArticleById(id, { includeDraft: true })!;
}
```

- [ ] **Step 4: Implement translation service**

Create `src/lib/translation/service.ts`:

```ts
import { listPublishedArticlesMissingEnglish, updateArticleEnglishFields } from "@/lib/services/articles";
import { getSetting } from "@/lib/services/settings";
import { buildTranslationMessages } from "./prompt";
import { requestOpenRouterTranslation } from "./openrouter";
import { TranslationInputSchema, type TranslationInput, type TranslationOutput } from "./schema";

export type TranslateFunction = (input: TranslationInput, model: string) => Promise<TranslationOutput>;

export type BatchTranslationResult = {
  summary: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
  successes: Array<{ id: number; titleZh: string }>;
  failures: Array<{ id: number; titleZh: string; error: string }>;
};

export function translationModel() {
  return getSetting("openrouterTranslationModel").trim() || "inclusionai/ring-2.6-1t:free";
}

export async function translateArticleDraft(input: TranslationInput, model = translationModel(), translate: TranslateFunction = defaultTranslate) {
  const parsed = TranslationInputSchema.parse(input);
  return translate(parsed, model);
}

async function defaultTranslate(input: TranslationInput, model: string) {
  return requestOpenRouterTranslation({
    model,
    messages: buildTranslationMessages(input),
  });
}

async function translateWithRetry(input: TranslationInput, model: string, translate: TranslateFunction) {
  try {
    return await translate(input, model);
  } catch (firstError) {
    try {
      return await translate(input, model);
    } catch (secondError) {
      throw secondError instanceof Error ? secondError : firstError;
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown translation error.";
}

export async function translatePublishedMissingEnglish({
  model = translationModel(),
  translate = defaultTranslate,
}: {
  model?: string;
  translate?: TranslateFunction;
} = {}): Promise<BatchTranslationResult> {
  const articles = listPublishedArticlesMissingEnglish();
  const result: BatchTranslationResult = {
    summary: {
      attempted: articles.length,
      succeeded: 0,
      failed: 0,
    },
    successes: [],
    failures: [],
  };

  for (const article of articles) {
    try {
      const translation = await translateWithRetry(
        TranslationInputSchema.parse({
          titleZh: article.titleZh,
          excerptZh: article.excerptZh,
          bodyZh: article.bodyZh ?? "",
        }),
        model,
        translate,
      );
      updateArticleEnglishFields(article.id, translation);
      result.summary.succeeded += 1;
      result.successes.push({ id: article.id, titleZh: article.titleZh });
    } catch (error) {
      result.summary.failed += 1;
      result.failures.push({ id: article.id, titleZh: article.titleZh, error: errorMessage(error) });
    }
  }

  return result;
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm test tests/translation.test.ts
```

Expected: PASS. If ordering differs, keep `order by published_at desc, id desc` and adjust expected slug order to match the actual newest-first order; do not remove deterministic ordering.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/services/articles.ts src/lib/translation/service.ts tests/translation.test.ts
git commit -m "feat: add article translation service"
```

---

### Task 4: Add Translation API Routes

**Files:**
- Create: `src/app/studio/api/translations/article/route.ts`
- Create: `src/app/studio/api/translations/published-missing/route.ts`
- Modify: `tests/studio-api.test.ts`

- [ ] **Step 1: Add unauthenticated API contract tests**

Append to `tests/studio-api.test.ts`:

```ts
  it("rejects unauthenticated single article translation", async () => {
    const mod = await import("@/app/studio/api/translations/article/route");
    const response = await mod.POST(new Request("http://localhost/studio/api/translations/article", { method: "POST", body: "{}" }));

    expect(response.status).toBe(401);
  });

  it("rejects unauthenticated batch translation", async () => {
    const mod = await import("@/app/studio/api/translations/published-missing/route");
    const response = await mod.POST(new Request("http://localhost/studio/api/translations/published-missing", { method: "POST", body: "{}" }));

    expect(response.status).toBe(401);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test tests/studio-api.test.ts
```

Expected: FAIL because route modules do not exist.

- [ ] **Step 3: Implement single article route**

Create `src/app/studio/api/translations/article/route.ts`:

```ts
import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { translateArticleDraft } from "@/lib/translation/service";
import { TranslationInputSchema } from "@/lib/translation/schema";

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const input = TranslationInputSchema.parse(await request.json());
    const translation = await translateArticleDraft(input);
    return Response.json({ translation });
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 4: Implement batch route**

Create `src/app/studio/api/translations/published-missing/route.ts`:

```ts
import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { translatePublishedMissingEnglish } from "@/lib/translation/service";

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const result = await translatePublishedMissingEnglish();
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
```

- [ ] **Step 5: Run API contract tests**

Run:

```bash
pnpm test tests/studio-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/app/studio/api/translations tests/studio-api.test.ts
git commit -m "feat: add translation API routes"
```

---

### Task 5: Add Editor Translation UI

**Files:**
- Modify: `src/components/studio/ArticleEditor.tsx`
- Modify: `tests/editor-components.test.tsx`

- [ ] **Step 1: Add failing component tests**

Append to the `describe("ArticleEditor", ...)` block in `tests/editor-components.test.tsx`:

```tsx
  it("shows and saves the English excerpt field", () => {
    render(<ArticleEditor article={article({ excerptEn: "English excerpt" })} />);

    expect(screen.getByRole("textbox", { name: "English excerpt" })).toHaveValue("English excerpt");
  });

  it("translates Chinese fields into English fields without saving", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      Response.json({
        translation: {
          titleEn: "Morality and Reason",
          excerptEn: "Where do all these villains come from?",
          bodyEn: "English body.",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ArticleEditor article={article({ titleZh: "道德与理性", excerptZh: "哪里来那么多坏人", bodyZh: "中文正文" })} />);

    await user.click(screen.getByRole("button", { name: "Translate to English" }));

    expect(await screen.findByText("Translation ready. Review before saving.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "English title" })).toHaveValue("Morality and Reason");
    expect(screen.getByRole("textbox", { name: "English excerpt" })).toHaveValue("Where do all these villains come from?");
    expect(screen.getByRole("textbox", { name: "English body" })).toHaveValue("English body.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/studio/api/translations/article",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          titleZh: "道德与理性",
          excerptZh: "哪里来那么多坏人",
          bodyZh: "中文正文",
        }),
      }),
    );
  });
```

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```bash
pnpm test tests/editor-components.test.tsx
```

Expected: FAIL because the English excerpt field and button do not exist.

- [ ] **Step 3: Add translation state and function**

In `src/components/studio/ArticleEditor.tsx`, add this type near existing local types:

```ts
type TranslationResponse = {
  translation?: {
    titleEn: string;
    excerptEn: string;
    bodyEn: string;
  };
  error?: string;
};
```

Inside `ArticleEditor`, add state after `message`:

```ts
const [isTranslating, setIsTranslating] = useState(false);
```

Add this function before `save()`:

```ts
async function translateToEnglish() {
  setMessage("");
  setIsTranslating(true);
  try {
    const response = await fetch("/studio/api/translations/article", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() ?? "" },
      body: JSON.stringify({
        titleZh: form.titleZh,
        excerptZh: form.excerptZh,
        bodyZh: form.bodyZh,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as TranslationResponse;
    if (!response.ok || !data.translation) {
      setMessage(data.error ? `Translation failed: ${data.error}` : "Translation failed");
      return;
    }
    setForm((current) => ({
      ...current,
      titleEn: data.translation!.titleEn,
      excerptEn: data.translation!.excerptEn,
      bodyEn: data.translation!.bodyEn,
    }));
    setMessage("Translation ready. Review before saving.");
  } catch {
    setMessage("Translation failed");
  } finally {
    setIsTranslating(false);
  }
}
```

- [ ] **Step 4: Add English excerpt and button to JSX**

In the JSX, after the `English title` label, add:

```tsx
<label className="grid gap-2">
  English excerpt
  <textarea className="min-h-24 border border-[var(--rule)] bg-white p-3" value={form.excerptEn} onChange={(event) => set("excerptEn", event.target.value)} />
</label>
```

Then before `<MarkdownEditor label="English body"...`, add:

```tsx
<button type="button" onClick={translateToEnglish} disabled={isTranslating} className="w-fit border border-[var(--rule)] px-4 py-2 disabled:opacity-50">
  {isTranslating ? "Translating..." : "Translate to English"}
</button>
```

- [ ] **Step 5: Run component tests**

Run:

```bash
pnpm test tests/editor-components.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/studio/ArticleEditor.tsx tests/editor-components.test.tsx
git commit -m "feat: add editor translation action"
```

---

### Task 6: Add Articles Page Batch Translation UI

**Files:**
- Create: `src/components/studio/TranslateMissingEnglishButton.tsx`
- Modify: `src/app/studio/(protected)/articles/page.tsx`
- Test: `tests/editor-components.test.tsx`

- [ ] **Step 1: Add failing component tests for batch button**

Add this import near the top of `tests/editor-components.test.tsx` with the other component imports:

```ts
import { TranslateMissingEnglishButton } from "@/components/studio/TranslateMissingEnglishButton";
```

Append this `describe` block:

```tsx
describe("TranslateMissingEnglishButton", () => {
  it("shows saved batch translation results", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          summary: { attempted: 2, succeeded: 1, failed: 1 },
          successes: [{ id: 1, titleZh: "道德与理性" }],
          failures: [{ id: 2, titleZh: "反战的人们，醒醒了！", error: "OpenRouter request failed with status 429." }],
        }),
      ),
    );

    render(<TranslateMissingEnglishButton />);

    await user.click(screen.getByRole("button", { name: "Translate missing English" }));

    expect(await screen.findByText("Attempted 2. Saved 1. Failed 1.")).toBeVisible();
    expect(screen.getByText("Saved: 道德与理性")).toBeVisible();
    expect(screen.getByText("Failed: 反战的人们，醒醒了！ - OpenRouter request failed with status 429.")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```bash
pnpm test tests/editor-components.test.tsx
```

Expected: FAIL because `TranslateMissingEnglishButton` does not exist.

- [ ] **Step 3: Implement the batch button component**

Create `src/components/studio/TranslateMissingEnglishButton.tsx`:

```tsx
"use client";

import { useState } from "react";

type BatchResult = {
  summary: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
  successes: Array<{ id: number; titleZh: string }>;
  failures: Array<{ id: number; titleZh: string; error: string }>;
  error?: string;
};

function csrfToken() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("arthurs_review_csrf="))
    ?.split("=")[1];
}

export function TranslateMissingEnglishButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [message, setMessage] = useState("");

  async function translateMissingEnglish() {
    setIsRunning(true);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/studio/api/translations/published-missing", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() ?? "" },
      });
      const data = (await response.json().catch(() => ({}))) as BatchResult;
      if (!response.ok) {
        setMessage(data.error ? `Batch translation failed: ${data.error}` : "Batch translation failed");
        return;
      }
      setResult(data);
    } catch {
      setMessage("Batch translation failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="sans mt-4 border-y border-[var(--rule)] py-4">
      <button type="button" onClick={translateMissingEnglish} disabled={isRunning} className="border border-[var(--rule)] px-4 py-2 disabled:opacity-50">
        {isRunning ? "Translating..." : "Translate missing English"}
      </button>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
      {result ? (
        <div className="mt-3 grid gap-2 text-sm">
          <p>
            Attempted {result.summary.attempted}. Saved {result.summary.succeeded}. Failed {result.summary.failed}.
          </p>
          {result.successes.map((item) => (
            <p key={`success-${item.id}`}>Saved: {item.titleZh}</p>
          ))}
          {result.failures.map((item) => (
            <p key={`failure-${item.id}`}>
              Failed: {item.titleZh} - {item.error}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Mount the button on the Articles page**

In `src/app/studio/(protected)/articles/page.tsx`, add the import:

```ts
import { TranslateMissingEnglishButton } from "@/components/studio/TranslateMissingEnglishButton";
```

Then add the component right after the `<h1>`:

```tsx
<TranslateMissingEnglishButton />
```

The top of the returned section should become:

```tsx
return (
  <section>
    <h1 className="text-4xl font-bold">Articles</h1>
    <TranslateMissingEnglishButton />
    <form className="sans mt-6 grid gap-3 border-y border-[var(--rule)] py-4 md:grid-cols-[1fr_1fr_2fr_auto]">
```

- [ ] **Step 5: Run component tests**

Run:

```bash
pnpm test tests/editor-components.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/studio/TranslateMissingEnglishButton.tsx src/app/studio/'(protected)'/articles/page.tsx tests/editor-components.test.tsx
git commit -m "feat: add batch translation control"
```

---

### Task 7: Full Verification and Implementation Review

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Run unit and component tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 4: Run a production build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git diff --stat HEAD~6..HEAD
git diff --check
```

Expected: `git diff --check` produces no whitespace errors. The stat should include only translation, settings, article service, Studio UI, API routes, and tests.

- [ ] **Step 6: Final commit if verification required fixes**

If Step 1-5 required fixes, commit them:

```bash
git add <fixed-files>
git commit -m "fix: finish translation verification"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: tasks cover model setting, OpenRouter client, prompt, strict JSON schema, single route, batch route, editor form fill without save, batch save, retry-once behavior, published missing-English filter, and verification.
- Scope check: no queue, no scheduled job, no translated slug, no fallback model, no public language preference changes.
- Type consistency: setting key is `openrouterTranslationModel`; route paths are `/studio/api/translations/article` and `/studio/api/translations/published-missing`; translated fields are `titleEn`, `excerptEn`, and `bodyEn`.
