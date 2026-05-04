# Arthur's Review Implementation Audit

Date: 2026-05-04
Branch: `feat/arthurs-review-implementation`
Workspace: `/Users/arthur/myblog`

## Scope

Reviewed the approved spec, the implementation plan, and current code:

- Spec: `docs/superpowers/specs/2026-05-03-arthurs-review-design.md`
- Plan: `docs/superpowers/plans/2026-05-03-arthurs-review-implementation.md`
- App code: `src/`, `tests/`, `e2e/`, `deploy/`, `scripts/`

The plan file still has all task checkboxes unchecked, so it is not reliable as execution history. I treated it as an intended implementation contract and checked actual code directly.

## Verification Run

Fresh local verification completed on 2026-05-04:

- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `pnpm test`: pass, 6 files / 14 tests
- `pnpm test:e2e`: pass, 10 tests
- `pnpm build`: pass
- `docker compose -f deploy/docker-compose.yml config`: pass
- `git status --short`: clean before this audit file was added

Important caveat: the automated tests are narrow happy-path tests. They do not cover several spec requirements: unpublish, article list filters, inline Markdown image upload, Markdown preview, article cover rendering on article pages, per-page SEO metadata, invalid media API responses, or production DNS/TLS.

Update after repair pass:

- Added regression coverage for the missing requirements above.
- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `pnpm test`: pass, 12 files / 22 tests
- `pnpm test:e2e`: pass, 16 tests
- `pnpm build`: pass
- `docker compose -f deploy/docker-compose.yml config`: pass
- Post-build check: `/robots.txt` is dynamic and `.next` no longer contains a static `Sitemap: http://localhost:3000/sitemap.xml` robots body.

## Production Probe

From this local environment:

- `dig +short blog.leesaitool.com`: no answer
- `curl -I --max-time 10 http://blog.leesaitool.com`: `HTTP/1.1 503 Service Unavailable`
- `curl -I --max-time 10 https://blog.leesaitool.com/healthz`: `SSL_ERROR_SYSCALL`
- `curl -fsS --max-time 10 https://blog.leesaitool.com/robots.txt`: `SSL_ERROR_SYSCALL`

This does not prove the server is permanently broken, because the local proxy path may be involved, but it means production verification from here did not satisfy the spec.

## Findings To Fix

### 1. Static robots.txt bakes localhost into production

Evidence:

- `src/app/robots.ts` reads `SITE_URL` through `absoluteUrl()`.
- `pnpm build` generated `.next/server/app/robots.txt.body` containing `Sitemap: http://localhost:3000/sitemap.xml`.
- `Dockerfile` runs `pnpm build` before runtime `production.env` is available.

Impact: production `robots.txt` can advertise localhost instead of `https://blog.leesaitool.com`, violating the SEO/discovery requirements.

Fix direction: make robots dynamic or ensure build-time `SITE_URL` is injected. Dynamic is simpler and safer for this app.

### 2. Per-page SEO metadata is missing

Evidence:

- `rg "generateMetadata|export const metadata" src/app` only finds `src/app/layout.tsx`.
- Article/category/search/about pages render UI but do not define route-specific title, description, canonical URL, or Open Graph metadata.
- Article `seoDescription` is collected in the editor and stored, but public pages never use it for metadata.

Impact: spec requires per-page title/description, canonical URLs, and Open Graph metadata.

Fix direction: add metadata helpers and `generateMetadata` to public pages, especially article pages.

### 3. Studio article list lacks required filters

Evidence:

- Spec requires filters for status, category, and search.
- `src/app/studio/(protected)/articles/page.tsx` only lists all articles with title and status.

Impact: admin browsing does not match the required Studio workflow.

Fix direction: add server-side query params and a filter/search form.

### 4. Studio editor lacks unpublish UI

Evidence:

- Spec requires unpublish back to draft.
- API route exists at `src/app/studio/api/articles/[id]/unpublish/route.ts`.
- `src/components/studio/ArticleEditor.tsx` renders Save draft, Preview, and Publish only.

Impact: an admin cannot complete the publish -> draft workflow from Studio without hand-calling the endpoint.

Fix direction: add an Unpublish button for published articles and refresh editor state after success.

### 5. Existing-article publish can publish stale saved content

Evidence:

- In `ArticleEditor.publish()`, existing articles use `const saved = form.id ? ({ id: form.id } as Article) : await save();`.
- That skips saving current editor input before publishing.

Impact: editing an existing draft/published article and clicking Publish can publish the older database body/title instead of the text on screen.

Fix direction: always save current form state before publish, then publish the returned article id.

### 6. Markdown preview is missing

Evidence:

- Spec requires Markdown preview.
- `src/components/studio/MarkdownEditor.tsx` is only a textarea.

Impact: editor workflow does not match spec.

Fix direction: add a preview panel using the existing sanitized `ArticleRenderer`.

### 7. Inline Markdown image upload is missing

Evidence:

- Spec requires upload cover images and inline images for Markdown.
- Current `ImageUploader` only writes `coverImagePath`.
- `MarkdownEditor` has no upload/insert flow.

Impact: inline media is impossible through the Studio UI.

Fix direction: add inline image upload to Markdown editor and insert `![alt](/media/...)` at the cursor or append it.

### 8. Article pages do not render cover images

Evidence:

- Spec final browser verification includes article page with cover image.
- `src/app/_articlePage.tsx` renders metadata, title, and body only.
- `ArticleCard` renders cover images, but article pages do not.

Impact: article-level cover images do not appear on article pages.

Fix direction: render `coverImagePath` between title and body with no placeholder when missing.

### 9. Invalid media uploads return unclear server errors

Evidence:

- `processImageUpload()` throws clear validation errors for type and size.
- `src/app/studio/api/media/route.ts` does not catch those errors.

Impact: invalid uploads are likely surfaced as 500 responses instead of clear JSON errors, violating the invalid image upload requirement.

Fix direction: catch known upload validation errors and return `400` with `{ error }`.

### 10. Featured article settings can become inconsistent

Evidence:

- `SettingsForm` accepts a raw `featuredArticleId` string.
- `settings` route stores all settings first, then calls `setFeaturedArticle(Number(input.featuredArticleId))`.
- `setFeaturedArticle()` accepts drafts via `includeDraft: true`.
- Home only selects from published articles, so a draft featured article silently falls back to the first published article.

Impact: settings can claim one featured article while the home page shows another.

Fix direction: validate featured id as empty or a published article, update settings and featured flag in one consistent operation, and offer a select UI instead of raw id text.

### 11. Deployment backup is script-only, not scheduled

Evidence:

- Spec requires daily backup with 30-day retention.
- `scripts/backup-data.sh` implements an on-demand archive and retention delete.
- `server-bootstrap.sh` does not install a cron job or systemd timer.

Impact: deployed system will not automatically create daily backups unless a human wires it manually.

Fix direction: add a cron/systemd timer setup in server bootstrap or a documented install command in deploy scripts.

### 12. README still contains the default create-next-app text

Evidence:

- `README.md` is still the stock Next.js template.

Impact: handoff docs do not explain this app, env vars, data directory, scripts, deployment, or backups.

Fix direction: replace README with project-specific operations notes.

## Secondary Gaps

- `TagPicker` asks for raw numeric tag IDs, which works but is not a humane tag management UI.
- API validation errors and duplicate slug errors are mostly generic or uncaught.
- `article_search` FTS table exists but the search service uses in-memory substring matching; not a launch blocker, but it is dead weight right now.
- The final production checklist from the plan has not been completed from this environment.

## Repair Checklist

- [x] Add tests that fail for the concrete behavior gaps where practical.
- [x] Fix `robots.txt` production URL behavior.
- [x] Add public page metadata and article metadata.
- [x] Add article-page cover image rendering.
- [x] Add Studio article filters.
- [x] Add unpublish UI.
- [x] Make publish save current editor input first.
- [x] Add Markdown preview.
- [x] Add inline image upload insertion.
- [x] Return clear media upload validation errors.
- [x] Make featured article selection consistent and published-only.
- [x] Add automatic backup scheduling support.
- [x] Replace README with project-specific docs.
- [x] Run full verification: lint, typecheck, unit tests, e2e, build, compose config.

## Repair Summary

Completed in this pass:

- Made `robots.txt` dynamic so runtime `SITE_URL` is used.
- Added reusable metadata helpers and route metadata for public pages and articles.
- Rendered cover images on article pages with typography-only layout when missing.
- Added Studio filters for status, category, and search.
- Added Unpublish UI and fixed Publish to save current editor state first.
- Added Markdown preview and inline image upload insertion.
- Returned clear JSON errors for invalid media uploads.
- Restricted featured articles to published articles and replaced raw settings id input with a select.
- Made login rate limiting read env config and raised the e2e limit to avoid parallel-test false failures.
- Replaced the default README with project-specific setup/deploy/backup docs.
- Added daily backup cron installation to server bootstrap.
- Removed the inert `Ready` button from the editor.

Still not completed locally:

- Actual production DNS/TLS deployment verification. The earlier local probe failed, but this workspace cannot update Porkbun DNS or prove the VPS state without production access/credentials.
