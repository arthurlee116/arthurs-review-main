# Arthur's Review Design Spec

Date: 2026-05-03
Status: Approved for implementation planning

## Summary

Arthur's Review is a personal intellectual publication, not a media-company clone and not a generic blog. It should feel like a serious editor-led review written by one person: structured, opinionated, quiet, and readable.

The first version will be a Next.js full-stack app deployed to Arthur's VPS at `187.124.247.64`, served at `blog.leesaitool.com` through Caddy with automatic HTTPS. Content is managed through a private single-user `/studio` backend and stored as SQLite metadata plus Markdown body files in a server-local persistent data directory.

## Product Shape

The public site has five top-level navigation entries:

- Home
- 时事评论
- 社会分析
- 杂七杂八
- About

Home is an edited front page. It shows the masthead, navigation, a manually selected featured article, and a mixed latest feed from all categories. The category pages are browsing archives with large article entries and no separate featured article. About is a short publication note plus the contact email `laoliarthur@outlook.com`.

The publication categories are fixed:

- 时事评论: shorter current-affairs commentary, often 100 to 300 Chinese characters.
- 社会分析: longer analysis of social issues.
- 杂七杂八: poetry, travel notes, and other writing that does not belong in the first two categories.

Tags are optional and user-managed. They support archive/search discovery, but they do not replace the three fixed categories and do not become primary navigation.

## Visual Direction

The approved visual direction is "classic review publication":

- Centered `Arthur's Review` masthead.
- Paper-like light background.
- Black rule lines and thin separators.
- A small red identifying rule or accent.
- Serif-led title typography with disciplined spacing.
- Minimal UI chrome.
- No gradient decoration, no card-heavy blog template, no dark mode in the first version.

The site may borrow the seriousness and order of publications like The Economist, but it must not look like a direct clone. The goal is a personal review with authority, not cosplay.

Home uses the chosen "featured article plus stacked feed" layout:

- Large featured article in the main position.
- Adjacent or subsequent stacked latest articles.
- Mixed latest feed below the feature, not separated into category blocks.
- Article entries may include a cover image. If no cover image exists, the design uses strong typography rather than a placeholder image.

Article pages use a narrow reading layout:

- Large title.
- Category, date, and optional language switch below the title.
- Body width around 680 to 760 px on desktop.
- Chinese reading comfort takes priority over decorative layout.

## Content Model

The content source is:

- SQLite for metadata.
- Markdown files for body content.
- Local uploaded media files for cover and inline images.

Article metadata includes:

- `id`
- `title_zh`
- `title_en` optional
- `slug`
- `category`
- `status`
- `published_at`
- `updated_at`
- `excerpt_zh`
- `excerpt_en` optional
- `cover_image_path` optional
- `is_featured`
- `seo_description`
- tag relations
- body file paths for Chinese and optional English Markdown

Each article requires a Chinese body. English is optional per article. If an English version exists, the article page shows a language switch near the date/category metadata. If no English version exists, no language switch is rendered.

Article URLs use category plus slug:

- `/commentary/<slug>`
- `/society/<slug>`
- `/misc/<slug>`

The internal category ids should be stable English ids, while the UI labels remain Chinese.

## Studio Backend

The private backend lives at `/studio`.

It is single-user only. There are no accounts, roles, team permissions, review workflows, or public draft share links. Authentication uses one administrator password stored outside the repository as an environment variable. Successful login creates a session cookie.

Security requirements:

- HTTPS-only in production.
- Rate limiting on login.
- Secure, httpOnly session cookie.
- CSRF protection for mutating actions.
- No secrets committed to git.
- Admin password must be configurable through deployment environment.

Studio screens:

- Login.
- Article list with filters for status, category, and search.
- Article editor.
- Tag management.
- Site settings.

Article editor capabilities:

- Create and edit title, slug, category, tags, excerpt, SEO description, cover image, Chinese Markdown body, and optional English Markdown body.
- Save as draft.
- Publish.
- Unpublish back to draft.
- Preview while logged in.
- Upload cover images.
- Upload inline images for Markdown.
- Markdown preview.

Publishing flow:

- Only two article states exist: draft and published.
- Preview is an action, not a status.
- The homepage featured article is manually selected in site settings or from an article action.

Site settings:

- Site name.
- Contact email.
- About content.
- Featured article.
- RSS metadata.

## Search

First version search is keyword search only. It should cover title, excerpt, body text, category, and tags.

Embedding search is explicitly deferred, but the search module should be shaped so a later semantic index can be added without redesigning the public UI. The first version should not block launch on embeddings.

## Media Handling

Images are optional. Upload handling should:

- Validate file type.
- Enforce a maximum file size.
- Resize large images to a practical web width, for example 1600 px maximum.
- Generate optimized web-facing output, preferably WebP where supported.
- Store the optimized image path in metadata.
- Avoid preserving original large uploads by default.

If an article has no cover image, the public UI uses typography-only layout. It must not render generic placeholder images.

## RSS, SEO, and Discovery

The first version includes:

- RSS feed.
- Sitemap.
- Per-page title and description.
- Canonical URLs.
- Open Graph metadata.
- Reasonable robots configuration.

No comments are included. There is no public analytics script in the first version. Access visibility is handled through server logs or very small server-side counts if implementation remains simple.

## Deployment Architecture

The app deploys to Arthur's VPS at `187.124.247.64`.

Production domain:

- `blog.leesaitool.com`

DNS:

- Managed through Porkbun DNS.
- Deployment will update or instruct updating the `blog` A record to point to `187.124.247.64`.
- Existing stale DNS pointing to an old server can be replaced.

Runtime:

- Docker Compose.
- Next.js app container.
- Caddy reverse proxy container.
- Persistent server-local data directory.

Caddy responsibilities:

- Listen on ports 80 and 443.
- Reverse proxy `blog.leesaitool.com` to the Next.js app container.
- Automatically obtain and renew TLS certificates.
- Redirect HTTP to HTTPS.

Expected persistent directory:

- `/var/www/arthurs-review/data`

That directory contains:

- SQLite database.
- Markdown article files.
- Uploaded optimized images.
- Caddy data if the deployment chooses host-mounted Caddy persistence.

Backups:

- Daily backup of SQLite and Markdown files.
- Retain 30 days.
- Uploaded images are intentionally excluded from backups.

Server initialization is in scope:

- Install Docker and Docker Compose if missing.
- Create application and data directories.
- Configure environment file with secrets outside git.
- Configure Caddy.
- Configure firewall for SSH, HTTP, and HTTPS.
- Deploy app.
- Verify HTTP to HTTPS redirect.
- Verify TLS certificate.
- Verify app health.

## Error Handling

Public site:

- Missing article returns a proper 404 page.
- Draft articles are not publicly visible.
- Missing optional English content hides language controls.
- Missing cover image renders a typography-only entry.
- Search with no results shows a quiet empty state.

Studio:

- Invalid login shows a generic failure message.
- Repeated login failures are rate-limited.
- Slug collisions are blocked before publishing.
- Invalid image uploads are rejected with a clear message.
- Save failures preserve the editor input.
- Publish is blocked if required fields are missing.

Deployment:

- App startup should fail clearly if required environment variables are missing.
- Caddy certificate failures should be diagnosable from logs.
- A health endpoint should exist for deployment verification.

## Testing and Verification

Local verification:

- Type check.
- Lint.
- Unit tests for content parsing, slug validation, search indexing, and auth/session helpers.
- Route tests or integration tests for public article visibility and studio actions where practical.

Browser verification:

- Home page desktop and mobile.
- Category page desktop and mobile.
- Article page with cover image.
- Article page without cover image.
- Article page with optional English version.
- `/studio` login.
- Draft save, preview, publish, and public visibility.
- Image upload and optimized image rendering.
- Search results and empty state.

Production verification:

- DNS resolves `blog.leesaitool.com` to the VPS.
- HTTP redirects to HTTPS.
- TLS certificate is valid.
- Public pages load.
- `/studio` requires login.
- Published sample article is visible.
- Draft sample article is not public.
- RSS and sitemap load.
- Backup job produces SQLite and Markdown archive without images.

## Explicitly Out of Scope for Version 1

- Multi-user accounts.
- Comments.
- Public draft preview links.
- Full CMS workflow.
- AI translation automation.
- Embedding search.
- Dark mode.
- External object storage.
- Postgres.
- Google Analytics or heavy tracking.
- Mandatory cover images.
- Backing up uploaded images.

## Implementation Recommendation

Use Next.js as a full-stack monolith. Keep the codebase boring and legible:

- Public routes for publication pages.
- Studio routes for authenticated editing.
- Server-side content services for article metadata, Markdown IO, tags, settings, and search.
- A small auth/session layer.
- A media service for upload validation and optimization.
- A deployment folder for Docker Compose, Caddyfile, and server scripts.

This is the right amount of architecture for a serious single-person publication. Anything heavier would be theater.
