# AI Translation Design Spec

Date: 2026-05-11
Status: Awaiting user review before implementation planning

## Summary

Arthur's Review already supports optional English article fields and `?lang=en` article pages. The missing piece is an authoring workflow that can generate those English fields from the Chinese draft through OpenRouter, without making Arthur manually translate every article.

The feature will add two translation flows:

- A single-article Studio editor button that translates the current Chinese title, excerpt, and body into English, fills the English fields, and does not save automatically.
- A Studio article-list batch button that translates published articles missing English content, saves successful results, retries each failed article once, and reports successes and failures.

The translation should be faithful, clear, and natural. It should preserve Arthur's argument, political/social analysis style, directness, rhythm, and occasional sharpness without expanding the essay, softening the stance, or turning it into generic English media prose.

## Decisions

- Translate `titleEn`, `excerptEn`, and `bodyEn`.
- Do not translate or rewrite slugs.
- Do not generate a separate English SEO description in this pass.
- The editor translation button may overwrite existing English fields.
- The batch button only processes `published` articles with missing English content.
- Missing English content means at least one of `titleEn`, `excerptEn`, or `bodyEn` is empty.
- Single-article translation fills the form only; Arthur reviews and saves manually.
- Batch translation writes successful results directly to the article metadata and English Markdown files.
- `OPENROUTER_API_KEY` lives in environment variables only.
- The OpenRouter model name is editable in Studio Settings.
- The default model is `inclusionai/ring-2.6-1t:free`.
- There is no automatic fallback model. Free models drift and fail; silently mixing models in one batch would make translation style inconsistent.

## Current Code Context

The current app already has the right content shape:

- `src/lib/services/articles.ts` defines `titleEn`, `excerptEn`, `bodyEn`, and Markdown body paths.
- `src/lib/db/schema.sql` stores `title_en`, `excerpt_en`, and `body_en_path`.
- `src/app/_articlePage.tsx` switches to English when `?lang=en` is present and an English body exists.
- `src/components/LanguageSwitch.tsx` hides the language switch when no English body exists.
- `src/components/studio/ArticleEditor.tsx` already edits English title and English body, but the UI currently lacks an English excerpt field even though the model and API support it.
- `src/app/studio/(protected)/articles/page.tsx` is the natural home for the batch action.

The implementation should keep these existing boundaries. Do not move article storage, introduce a CMS, add a job queue, or redesign language routing.

## Architecture

Add a focused translation module under `src/lib/translation/`.

`src/lib/translation/openrouter.ts`:

- Reads `OPENROUTER_API_KEY`.
- Calls `POST https://openrouter.ai/api/v1/chat/completions`.
- Sends `Authorization`, `Content-Type`, `HTTP-Referer`, and `X-OpenRouter-Title` headers.
- Uses non-streaming responses.
- Returns raw assistant content plus useful request metadata when available.

`src/lib/translation/schema.ts`:

- Defines the Zod schema for translated output:
  - `titleEn: string`
  - `excerptEn: string`
  - `bodyEn: string`
- Exposes the JSON Schema shape sent to OpenRouter through `response_format`.

`src/lib/translation/prompt.ts`:

- Builds the system and user prompts.
- Includes article title, excerpt, and Markdown body.
- States that output must be JSON only.

`src/lib/translation/service.ts`:

- Exposes `translateArticleDraft(input, model)`.
- Exposes a batch helper for published articles missing English content.
- Handles retry-once behavior for batch items.
- Validates OpenRouter output before returning or saving.

The route handlers should stay thin. They authenticate, validate request bodies, call the translation service, and return structured JSON.

## API Design

### Single Article Translation

Route: `POST /studio/api/translations/article`

Input:

```json
{
  "titleZh": "中文标题",
  "excerptZh": "中文 take away",
  "bodyZh": "中文 Markdown 正文"
}
```

Behavior:

- Requires Studio admin session and CSRF token.
- Reads the configured OpenRouter model from Studio Settings.
- Calls the translation service.
- Returns translated fields.
- Does not create or update an article.

Output:

```json
{
  "translation": {
    "titleEn": "English title",
    "excerptEn": "English takeaway",
    "bodyEn": "English Markdown body"
  }
}
```

### Batch Translation

Route: `POST /studio/api/translations/published-missing`

Behavior:

- Requires Studio admin session and CSRF token.
- Finds `published` articles where `titleEn`, `excerptEn`, or `bodyEn` is missing.
- For each article, translates the Chinese title, Chinese excerpt, and Chinese body.
- Saves `titleEn`, `excerptEn`, and `bodyEn`.
- Retries each failed article once.
- Continues to later articles after a final failure.
- Returns a success and failure summary.

Output:

```json
{
  "summary": {
    "attempted": 9,
    "succeeded": 8,
    "failed": 1
  },
  "successes": [
    {
      "id": 9,
      "titleZh": "“衰微的民族”--解药是什么？"
    }
  ],
  "failures": [
    {
      "id": 7,
      "titleZh": "反战的人们，醒醒了！",
      "error": "OpenRouter returned invalid JSON after retry."
    }
  ]
}
```

## Studio UI

### Article Editor

Add a `Translate to English` button near the English fields.

Expected behavior:

- Disabled while translation is running.
- Sends the current Chinese title, Chinese excerpt, and Chinese body.
- Fills English title, English excerpt, and English body on success.
- Does not save automatically.
- Shows a clear failure message if configuration or OpenRouter fails.
- Can overwrite existing English fields. Arthur can edit the result before saving.

Also add the missing `English excerpt` textarea to the editor. The app already stores and searches `excerptEn`; hiding it in the editor is just an annoying gap.

### Article List

Add a `Translate missing English` button near the top of the Articles page, close to the filters.

Expected behavior:

- The action targets all published articles missing English content, not only the visible filtered list.
- The result panel shows attempted, succeeded, failed, and skipped counts when useful.
- Failure rows include article title and error message.
- The UI should make it clear that successful batch translations were already saved.

This should not become a queue dashboard. There are around 9-10 existing articles to fix; a heavy job system would be silly.

### Settings

Add an OpenRouter translation model field to Studio Settings.

Suggested setting key:

```text
openrouter_translation_model
```

Default value:

```text
inclusionai/ring-2.6-1t:free
```

API keys must not be stored in Settings.

## Translation Prompt

The prompt should be specific enough to preserve Arthur's voice:

- Translate from Chinese to English for Arthur's Review, a personal political and social commentary publication.
- Preserve the author's argument, stance, rhetorical pressure, and directness.
- Keep the English natural and clear for an educated English reader.
- Do not soften political judgments.
- Do not add new claims, examples, citations, hedging, or explanations.
- Do not remove claims just because they are sharp.
- Preserve Markdown structure, headings, links, blockquotes, lists, emphasis, and paragraph breaks.
- Translate mixed English terms such as `stereotypes`, `PTSD`, or named works naturally in context.
- Avoid machine-translation stiffness.
- Avoid turning the prose into polished institutional media copy.
- Return only JSON matching the required schema.

The model request should use a low temperature, around `0.2`, because this is controlled translation rather than creative generation.

## OpenRouter Contract

Use OpenRouter's official chat completions API:

- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Method: `POST`
- Body includes `model`, `messages`, `temperature`, and `response_format`.
- `response_format` uses JSON Schema with `strict: true` where the selected model supports it.
- The response parser reads `choices[0].message.content`.

If a selected free model does not support strict structured output, the route should return a clear error rather than silently accepting malformed text. The user can change the model in Settings.

## Error Handling

Configuration errors:

- Missing `OPENROUTER_API_KEY` returns a clear Studio-facing error.
- Missing model setting uses the default model.
- Empty Chinese title or body returns validation error before calling OpenRouter.

OpenRouter errors:

- Non-2xx response is an error.
- Missing assistant content is an error.
- Invalid JSON is an error.
- Output failing schema validation is an error.
- Batch translation retries each article once, then records failure and continues.

Saving errors:

- Batch saves should update article metadata and English body together for each article.
- A failure to save one article should be reported and should not stop later articles.

Security:

- Translation APIs require the same admin session checks as other Studio APIs.
- Mutating routes require CSRF.
- Never expose `OPENROUTER_API_KEY` to the client.
- Do not log full article bodies in errors.

## Testing

Add focused coverage without turning this into ceremony soup.

Unit tests:

- Prompt builder includes title, excerpt, body, and voice instructions.
- Translation schema accepts valid output and rejects missing fields.
- OpenRouter client handles success, non-2xx, empty content, invalid JSON, and schema failure with mocked `fetch`.
- Batch service filters to published articles missing English fields.
- Batch service retries once and continues after failure.

API tests:

- Single translation requires auth and CSRF.
- Single translation returns fields and does not save an article.
- Batch translation only processes published articles with missing English content.
- Missing API key returns a useful error.

Component tests:

- Article editor shows `English excerpt`.
- `Translate to English` fills English title, excerpt, and body without saving.
- Articles page batch action shows success and failure summaries.

Final verification before implementation is claimed complete:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Run Studio e2e coverage if the implementation touches enough browser behavior that component tests no longer prove the flow.

## Non-Goals

- No automatic scheduled translation.
- No background queue.
- No automatic fallback model.
- No translation memory database.
- No per-paragraph diff viewer.
- No public language preference cookie.
- No translated slugs.
- No automatic publishing.

## Implementation Notes

- Reuse existing `settings` storage for the model setting.
- Add small article service helpers rather than duplicating SQL in translation code.
- Keep the translation routes under `src/app/studio/api/translations/`.
- Prefer server-side batch work over front-end loops so the browser does not need to stay open for each article.
- Keep route handlers compatible with current Next.js route handler conventions in this repo.

## Approval State

Arthur approved the product direction in chat:

- Translate English title, takeaway/excerpt, and body.
- Use a faithful, clear, natural translation style.
- Put the batch button on the Studio Articles page.
- Store OpenRouter API key in env and model name in Studio Settings.
- Batch only published missing-English articles.
- Retry each failed batch article once, then continue.

