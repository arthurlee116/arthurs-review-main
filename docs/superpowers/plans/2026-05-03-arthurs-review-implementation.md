# Arthur's Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy Arthur's Review as a Next.js full-stack personal publication with a private `/studio` editor, SQLite metadata, Markdown bodies, local image uploads, Caddy HTTPS, and VPS deployment scripts.

**Architecture:** Use one Next.js App Router application with public publication routes, authenticated studio routes, and server-only services for persistence, auth, Markdown IO, search, media, RSS, and SEO. Store durable content under a configurable `DATA_DIR`, with SQLite for metadata and Markdown/media files on disk. Deploy through Docker Compose with a Next.js app container behind Caddy, which handles automatic HTTPS for `blog.leesaitool.com`.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, SQLite via `better-sqlite3`, `zod`, `jose`, Node `crypto`, `sharp`, `react-markdown`, `remark-gfm`, `rehype-sanitize`, Vitest, Testing Library, Playwright, Docker Compose, Caddy.

---

## Source References

- Design spec: `docs/superpowers/specs/2026-05-03-arthurs-review-design.md`
- Next.js Route Handlers: `https://nextjs.org/docs/app/getting-started/route-handlers`
- Next.js authentication/session guidance: `https://nextjs.org/docs/app/building-your-application/authentication`
- Next.js sitemap convention: `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap`
- Next.js Proxy convention: `https://nextjs.org/docs/app/api-reference/file-conventions/proxy`
- Caddy Automatic HTTPS: `https://caddyserver.com/docs/automatic-https`
- Caddy reverse proxy: `https://caddyserver.com/docs/caddyfile/directives/reverse_proxy`

## Scope Check

The spec covers public reading, private editing, persistence, media, search, RSS/SEO, backups, and deployment. These are tightly coupled for the first working version because the public site depends on the studio-created content and the deployment must validate the whole publication. Keep the implementation in one plan, but commit after every task so a later worker can stop or resume cleanly.

## File Structure

Create this structure. Keep files focused; do not collapse services into one large utility file.

```text
.
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
├── tailwind.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── Dockerfile
├── .env.example
├── deploy/
│   ├── Caddyfile
│   ├── docker-compose.yml
│   └── production.env.example
├── scripts/
│   ├── backup-data.sh
│   ├── deploy.sh
│   ├── hash-password.mjs
│   ├── seed.mjs
│   └── server-bootstrap.sh
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── not-found.tsx
│   │   ├── robots.ts
│   │   ├── sitemap.ts
│   │   ├── feed.xml/route.ts
│   │   ├── healthz/route.ts
│   │   ├── search/page.tsx
│   │   ├── about/page.tsx
│   │   ├── commentary/[slug]/page.tsx
│   │   ├── commentary/page.tsx
│   │   ├── society/[slug]/page.tsx
│   │   ├── society/page.tsx
│   │   ├── misc/[slug]/page.tsx
│   │   ├── misc/page.tsx
│   │   ├── media/[...path]/route.ts
│   │   └── studio/
│   │       ├── layout.tsx
│   │       ├── page.tsx
│   │       ├── login/page.tsx
│   │       ├── articles/page.tsx
│   │       ├── articles/new/page.tsx
│   │       ├── articles/[id]/page.tsx
│   │       ├── tags/page.tsx
│   │       ├── settings/page.tsx
│   │       ├── preview/[id]/page.tsx
│   │       └── api/
│   │           ├── auth/login/route.ts
│   │           ├── auth/logout/route.ts
│   │           ├── articles/route.ts
│   │           ├── articles/[id]/route.ts
│   │           ├── articles/[id]/publish/route.ts
│   │           ├── articles/[id]/unpublish/route.ts
│   │           ├── media/route.ts
│   │           ├── settings/route.ts
│   │           └── tags/route.ts
│   ├── components/
│   │   ├── ArticleCard.tsx
│   │   ├── ArticleMeta.tsx
│   │   ├── ArticleRenderer.tsx
│   │   ├── LanguageSwitch.tsx
│   │   ├── Masthead.tsx
│   │   ├── PublicNav.tsx
│   │   ├── SearchBox.tsx
│   │   └── studio/
│   │       ├── ArticleEditor.tsx
│   │       ├── ImageUploader.tsx
│   │       ├── MarkdownEditor.tsx
│   │       ├── PendingButton.tsx
│   │       ├── StudioNav.tsx
│   │       └── TagPicker.tsx
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── constants.ts
│   │   │   ├── csrf.ts
│   │   │   ├── password.ts
│   │   │   ├── rate-limit.ts
│   │   │   └── session.ts
│   │   ├── content/
│   │   │   ├── categories.ts
│   │   │   ├── markdown.ts
│   │   │   ├── slugs.ts
│   │   │   └── urls.ts
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   ├── migrate.ts
│   │   │   ├── schema.sql
│   │   │   └── seed.ts
│   │   ├── media/
│   │   │   ├── image.ts
│   │   │   └── paths.ts
│   │   ├── services/
│   │   │   ├── articles.ts
│   │   │   ├── search.ts
│   │   │   ├── settings.ts
│   │   │   └── tags.ts
│   │   ├── env.ts
│   │   ├── rss.ts
│   │   └── seo.ts
│   ├── proxy.ts
│   └── test/
│       ├── factories.ts
│       └── setup.ts
├── tests/
│   ├── auth.test.ts
│   ├── content.test.ts
│   ├── media.test.ts
│   ├── search.test.ts
│   └── studio-api.test.ts
└── e2e/
    ├── public.spec.ts
    └── studio.spec.ts
```

## Task 1: Scaffold the Next.js App

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create the project scaffold**

Run:

```bash
pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

Expected: `package.json`, `src/app`, Tailwind, TypeScript, and ESLint files are created.

- [ ] **Step 2: Install runtime and test dependencies**

Run:

```bash
pnpm add better-sqlite3 zod jose sharp react-markdown remark-gfm rehype-sanitize clsx
pnpm add -D @types/better-sqlite3 vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event playwright
```

Expected: dependencies are added to `package.json` and `pnpm-lock.yaml`.

- [ ] **Step 3: Configure scripts in `package.json`**

Set the relevant scripts to this shape:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:migrate": "tsx src/lib/db/migrate.ts",
    "seed": "node scripts/seed.mjs",
    "hash-password": "node scripts/hash-password.mjs"
  }
}
```

If `tsx` is not installed by the scaffold, add it:

```bash
pnpm add -D tsx
```

Expected: `pnpm typecheck`, `pnpm test`, and `pnpm build` script names exist.

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 5: Configure Playwright**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
```

- [ ] **Step 6: Run initial checks**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: all pass with the starter app.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json pnpm-lock.yaml next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts vitest.config.ts playwright.config.ts src
git commit -m "chore: scaffold Next.js app"
```

## Task 2: Environment, Data Directories, and Database Schema

**Files:**
- Create: `.env.example`
- Create: `src/lib/env.ts`
- Create: `src/lib/db/schema.sql`
- Create: `src/lib/db/connection.ts`
- Create: `src/lib/db/migrate.ts`
- Create: `tests/content.test.ts`

- [ ] **Step 1: Write failing env and migration tests**

Create `tests/content.test.ts`:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arthurs-review-'))
  process.env.DATA_DIR = tmpDir
  process.env.SITE_URL = 'http://localhost:3000'
  process.env.ADMIN_PASSWORD_HASH = 'scrypt$16384$8$1$c2FsdA==$aGFzaA=='
  process.env.SESSION_SECRET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEF'
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('environment and database bootstrap', () => {
  it('creates expected data directories', async () => {
    const { ensureDataDirectories } = await import('@/lib/env')
    const dirs = ensureDataDirectories()

    expect(fs.existsSync(dirs.markdownDir)).toBe(true)
    expect(fs.existsSync(dirs.uploadsDir)).toBe(true)
    expect(fs.existsSync(dirs.backupsDir)).toBe(true)
  })

  it('runs migrations and creates core tables', async () => {
    const { migrate } = await import('@/lib/db/migrate')
    const { getDb } = await import('@/lib/db/connection')

    migrate()
    const db = getDb()

    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((row: any) => row.name)

    expect(tables).toContain('articles')
    expect(tables).toContain('tags')
    expect(tables).toContain('article_tags')
    expect(tables).toContain('settings')
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm test tests/content.test.ts
```

Expected: FAIL because `@/lib/env` and database modules do not exist.

- [ ] **Step 3: Add `.env.example`**

Create `.env.example`:

```bash
DATA_DIR=./data
SITE_URL=http://localhost:3000
ADMIN_PASSWORD_HASH=scrypt$16384$8$1$REPLACE_WITH_SALT$REPLACE_WITH_HASH
SESSION_SECRET=replace-with-32-plus-random-characters
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=8
```

- [ ] **Step 4: Implement env helpers**

Create `src/lib/env.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import 'server-only'
import { z } from 'zod'

const EnvSchema = z.object({
  DATA_DIR: z.string().min(1).default('./data'),
  SITE_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  SESSION_SECRET: z.string().min(32),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(8),
})

export function getEnv() {
  return EnvSchema.parse(process.env)
}

export function getDataPaths() {
  const env = getEnv()
  const root = path.resolve(env.DATA_DIR)
  return {
    root,
    dbPath: path.join(root, 'arthurs-review.sqlite3'),
    markdownDir: path.join(root, 'markdown'),
    uploadsDir: path.join(root, 'uploads'),
    backupsDir: path.join(root, 'backups'),
  }
}

export function ensureDataDirectories() {
  const paths = getDataPaths()
  for (const dir of [paths.root, paths.markdownDir, paths.uploadsDir, paths.backupsDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return paths
}
```

- [ ] **Step 5: Implement schema**

Create `src/lib/db/schema.sql`:

```sql
pragma journal_mode = wal;
pragma foreign_keys = on;

create table if not exists articles (
  id integer primary key autoincrement,
  title_zh text not null,
  title_en text,
  slug text not null,
  category text not null check (category in ('commentary', 'society', 'misc')),
  status text not null check (status in ('draft', 'published')) default 'draft',
  published_at text,
  updated_at text not null,
  excerpt_zh text not null default '',
  excerpt_en text,
  cover_image_path text,
  is_featured integer not null default 0 check (is_featured in (0, 1)),
  seo_description text not null default '',
  body_zh_path text not null,
  body_en_path text,
  unique(category, slug)
);

create table if not exists tags (
  id integer primary key autoincrement,
  name text not null unique,
  slug text not null unique,
  created_at text not null
);

create table if not exists article_tags (
  article_id integer not null references articles(id) on delete cascade,
  tag_id integer not null references tags(id) on delete cascade,
  primary key(article_id, tag_id)
);

create table if not exists settings (
  key text primary key,
  value text not null
);

create virtual table if not exists article_search using fts5(
  title_zh,
  title_en,
  excerpt_zh,
  excerpt_en,
  body_zh,
  body_en,
  category,
  tags,
  content='',
  tokenize='unicode61'
);
```

- [ ] **Step 6: Implement database connection and migration**

Create `src/lib/db/connection.ts`:

```ts
import fs from 'node:fs'
import Database from 'better-sqlite3'
import 'server-only'
import { ensureDataDirectories, getDataPaths } from '@/lib/env'

let db: Database.Database | undefined

export function getDb() {
  if (!db) {
    ensureDataDirectories()
    const { dbPath } = getDataPaths()
    fs.mkdirSync(dbPath.slice(0, dbPath.lastIndexOf('/')), { recursive: true })
    db = new Database(dbPath)
    db.pragma('foreign_keys = ON')
  }
  return db
}
```

Create `src/lib/db/migrate.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb } from './connection'

export function migrate() {
  const db = getDb()
  const dirname = path.dirname(fileURLToPath(import.meta.url))
  const schema = fs.readFileSync(path.join(dirname, 'schema.sql'), 'utf8')
  db.exec(schema)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm test tests/content.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add .env.example src/lib/env.ts src/lib/db tests/content.test.ts
git commit -m "feat: add data directory and database schema"
```

## Task 3: Content Types, Markdown IO, Slugs, and URLs

**Files:**
- Create: `src/lib/content/categories.ts`
- Create: `src/lib/content/slugs.ts`
- Create: `src/lib/content/urls.ts`
- Create: `src/lib/content/markdown.ts`
- Modify: `tests/content.test.ts`

- [ ] **Step 1: Add failing tests for categories, slugs, URLs, and Markdown**

Append to `tests/content.test.ts`:

```ts
describe('content helpers', () => {
  it('normalizes slugs into stable URL-safe ids', async () => {
    const { normalizeSlug } = await import('@/lib/content/slugs')

    expect(normalizeSlug(' City and Loneliness! ')).toBe('city-and-loneliness')
    expect(normalizeSlug('already-good')).toBe('already-good')
  })

  it('builds article URLs from category and slug', async () => {
    const { articlePath } = await import('@/lib/content/urls')

    expect(articlePath('commentary', 'short-note')).toBe('/commentary/short-note')
    expect(articlePath('society', 'city')).toBe('/society/city')
    expect(articlePath('misc', 'poem')).toBe('/misc/poem')
  })

  it('writes and reads markdown bodies under the data directory', async () => {
    const { writeMarkdownBody, readMarkdownBody } = await import('@/lib/content/markdown')

    const relPath = writeMarkdownBody(12, 'zh', '# 标题\n\n正文')

    expect(relPath).toBe('markdown/12.zh.md')
    expect(readMarkdownBody(relPath)).toBe('# 标题\n\n正文')
  })
})
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm test tests/content.test.ts
```

Expected: FAIL because content helper modules do not exist.

- [ ] **Step 3: Implement category constants**

Create `src/lib/content/categories.ts`:

```ts
export const categories = {
  commentary: { id: 'commentary', label: '时事评论', href: '/commentary' },
  society: { id: 'society', label: '社会分析', href: '/society' },
  misc: { id: 'misc', label: '杂七杂八', href: '/misc' },
} as const

export type CategoryId = keyof typeof categories

export function isCategoryId(value: string): value is CategoryId {
  return value === 'commentary' || value === 'society' || value === 'misc'
}

export function categoryLabel(category: CategoryId) {
  return categories[category].label
}
```

- [ ] **Step 4: Implement slug and URL helpers**

Create `src/lib/content/slugs.ts`:

```ts
export function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function assertValidSlug(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Slug must use lowercase letters, numbers, and single hyphens.')
  }
}
```

Create `src/lib/content/urls.ts`:

```ts
import type { CategoryId } from './categories'

export function articlePath(category: CategoryId, slug: string) {
  return `/${category}/${slug}`
}

export function categoryPath(category: CategoryId) {
  return `/${category}`
}
```

- [ ] **Step 5: Implement Markdown IO**

Create `src/lib/content/markdown.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import 'server-only'
import { ensureDataDirectories, getDataPaths } from '@/lib/env'

type Language = 'zh' | 'en'

export function writeMarkdownBody(articleId: number, language: Language, content: string) {
  const paths = ensureDataDirectories()
  const fileName = `${articleId}.${language}.md`
  const fullPath = path.join(paths.markdownDir, fileName)
  fs.writeFileSync(fullPath, content, 'utf8')
  return path.posix.join('markdown', fileName)
}

export function readMarkdownBody(relativePath: string) {
  const paths = getDataPaths()
  const fullPath = safeDataPath(paths.root, relativePath)
  return fs.readFileSync(fullPath, 'utf8')
}

export function safeDataPath(root: string, relativePath: string) {
  const resolved = path.resolve(root, relativePath)
  const rootWithSep = path.resolve(root) + path.sep
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error('Path escapes DATA_DIR.')
  }
  return resolved
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test tests/content.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/content tests/content.test.ts
git commit -m "feat: add content helpers"
```

## Task 4: Article, Tag, Settings, and Search Services

**Files:**
- Create: `src/lib/services/articles.ts`
- Create: `src/lib/services/tags.ts`
- Create: `src/lib/services/settings.ts`
- Create: `src/lib/services/search.ts`
- Create: `src/test/factories.ts`
- Create: `tests/search.test.ts`
- Modify: `tests/content.test.ts`

- [ ] **Step 1: Add failing service tests**

Append to `tests/content.test.ts`:

```ts
describe('article service', () => {
  it('creates a draft article with markdown bodies and tags', async () => {
    const { migrate } = await import('@/lib/db/migrate')
    const { createArticle, getArticleById } = await import('@/lib/services/articles')
    migrate()

    const article = createArticle({
      titleZh: '短评的锋利应该留一点余温',
      titleEn: 'A Short Note With Warmth',
      slug: 'short-note-with-warmth',
      category: 'commentary',
      excerptZh: '一段短评摘要',
      excerptEn: 'A short excerpt',
      seoDescription: 'Arthur writes a short current-affairs note.',
      bodyZh: '中文正文',
      bodyEn: 'English body',
      tagIds: [],
      coverImagePath: null,
    })

    const reloaded = getArticleById(article.id, { includeDraft: true })

    expect(reloaded?.status).toBe('draft')
    expect(reloaded?.bodyZh).toBe('中文正文')
    expect(reloaded?.bodyEn).toBe('English body')
  })

  it('publishes one featured article at a time', async () => {
    const { migrate } = await import('@/lib/db/migrate')
    const { createArticle, publishArticle, setFeaturedArticle, listPublishedArticles } =
      await import('@/lib/services/articles')
    migrate()

    const first = createArticle({
      titleZh: '第一篇',
      titleEn: null,
      slug: 'first',
      category: 'society',
      excerptZh: '摘要',
      excerptEn: null,
      seoDescription: '第一篇摘要',
      bodyZh: '正文',
      bodyEn: null,
      tagIds: [],
      coverImagePath: null,
    })
    const second = createArticle({
      titleZh: '第二篇',
      titleEn: null,
      slug: 'second',
      category: 'misc',
      excerptZh: '摘要',
      excerptEn: null,
      seoDescription: '第二篇摘要',
      bodyZh: '正文',
      bodyEn: null,
      tagIds: [],
      coverImagePath: null,
    })

    publishArticle(first.id)
    publishArticle(second.id)
    setFeaturedArticle(second.id)

    const published = listPublishedArticles()
    expect(published.filter((article) => article.isFeatured)).toHaveLength(1)
    expect(published.find((article) => article.isFeatured)?.id).toBe(second.id)
  })
})
```

Create `tests/search.test.ts`:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arthurs-review-search-'))
  process.env.DATA_DIR = tmpDir
  process.env.SITE_URL = 'http://localhost:3000'
  process.env.ADMIN_PASSWORD_HASH = 'scrypt$16384$8$1$c2FsdA==$aGFzaA=='
  process.env.SESSION_SECRET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEF'
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('keyword search', () => {
  it('finds published articles by body text and ignores drafts', async () => {
    const { migrate } = await import('@/lib/db/migrate')
    const { createArticle, publishArticle } = await import('@/lib/services/articles')
    const { searchArticles } = await import('@/lib/services/search')
    migrate()

    const published = createArticle({
      titleZh: '城市旁观者',
      titleEn: null,
      slug: 'city-bystander',
      category: 'society',
      excerptZh: '城市如何塑造沉默',
      excerptEn: null,
      seoDescription: '城市分析',
      bodyZh: '地铁、租房和旁观者心态',
      bodyEn: null,
      tagIds: [],
      coverImagePath: null,
    })
    createArticle({
      titleZh: '草稿文章',
      titleEn: null,
      slug: 'draft-only',
      category: 'society',
      excerptZh: '旁观者',
      excerptEn: null,
      seoDescription: '草稿',
      bodyZh: '旁观者',
      bodyEn: null,
      tagIds: [],
      coverImagePath: null,
    })

    publishArticle(published.id)

    const results = searchArticles('旁观者')
    expect(results.map((article) => article.slug)).toEqual(['city-bystander'])
  })
})
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm test tests/content.test.ts tests/search.test.ts
```

Expected: FAIL because services are missing.

- [ ] **Step 3: Implement service types and article service**

Create `src/lib/services/articles.ts` with these exported shapes:

```ts
import { getDb } from '@/lib/db/connection'
import { assertValidSlug } from '@/lib/content/slugs'
import { readMarkdownBody, writeMarkdownBody } from '@/lib/content/markdown'
import type { CategoryId } from '@/lib/content/categories'

export type ArticleStatus = 'draft' | 'published'

export type ArticleInput = {
  titleZh: string
  titleEn: string | null
  slug: string
  category: CategoryId
  excerptZh: string
  excerptEn: string | null
  seoDescription: string
  bodyZh: string
  bodyEn: string | null
  tagIds: number[]
  coverImagePath: string | null
}

export type Article = {
  id: number
  titleZh: string
  titleEn: string | null
  slug: string
  category: CategoryId
  status: ArticleStatus
  publishedAt: string | null
  updatedAt: string
  excerptZh: string
  excerptEn: string | null
  coverImagePath: string | null
  isFeatured: boolean
  seoDescription: string
  bodyZhPath: string
  bodyEnPath: string | null
  bodyZh?: string
  bodyEn?: string | null
}

function nowIso() {
  return new Date().toISOString()
}

function mapArticle(row: any): Article {
  return {
    id: row.id,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    slug: row.slug,
    category: row.category,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    excerptZh: row.excerpt_zh,
    excerptEn: row.excerpt_en,
    coverImagePath: row.cover_image_path,
    isFeatured: row.is_featured === 1,
    seoDescription: row.seo_description,
    bodyZhPath: row.body_zh_path,
    bodyEnPath: row.body_en_path,
  }
}

export function createArticle(input: ArticleInput) {
  assertValidSlug(input.slug)
  const db = getDb()
  const timestamp = nowIso()
  const bodyZhPath = writeMarkdownBody(0, 'zh', input.bodyZh)
  const bodyEnPath = input.bodyEn ? writeMarkdownBody(0, 'en', input.bodyEn) : null
  const result = db
    .prepare(
      `insert into articles
      (title_zh, title_en, slug, category, updated_at, excerpt_zh, excerpt_en, cover_image_path, seo_description, body_zh_path, body_en_path)
      values (@titleZh, @titleEn, @slug, @category, @updatedAt, @excerptZh, @excerptEn, @coverImagePath, @seoDescription, @bodyZhPath, @bodyEnPath)`
    )
    .run({ ...input, updatedAt: timestamp, bodyZhPath, bodyEnPath })

  const id = Number(result.lastInsertRowid)
  const finalZhPath = writeMarkdownBody(id, 'zh', input.bodyZh)
  const finalEnPath = input.bodyEn ? writeMarkdownBody(id, 'en', input.bodyEn) : null
  db.prepare('update articles set body_zh_path = ?, body_en_path = ? where id = ?').run(finalZhPath, finalEnPath, id)
  replaceArticleTags(id, input.tagIds)
  return getArticleById(id, { includeDraft: true })!
}

export function updateArticle(id: number, input: ArticleInput) {
  assertValidSlug(input.slug)
  const bodyZhPath = writeMarkdownBody(id, 'zh', input.bodyZh)
  const bodyEnPath = input.bodyEn ? writeMarkdownBody(id, 'en', input.bodyEn) : null
  getDb()
    .prepare(
      `update articles set title_zh = @titleZh, title_en = @titleEn, slug = @slug, category = @category,
      updated_at = @updatedAt, excerpt_zh = @excerptZh, excerpt_en = @excerptEn, cover_image_path = @coverImagePath,
      seo_description = @seoDescription, body_zh_path = @bodyZhPath, body_en_path = @bodyEnPath where id = @id`
    )
    .run({ ...input, id, updatedAt: nowIso(), bodyZhPath, bodyEnPath })
  replaceArticleTags(id, input.tagIds)
  return getArticleById(id, { includeDraft: true })!
}

export function getArticleById(id: number, options: { includeDraft: boolean }) {
  const row = getDb().prepare('select * from articles where id = ?').get(id)
  if (!row) return null
  const article = mapArticle(row)
  if (article.status === 'draft' && !options.includeDraft) return null
  return { ...article, bodyZh: readMarkdownBody(article.bodyZhPath), bodyEn: article.bodyEnPath ? readMarkdownBody(article.bodyEnPath) : null }
}

export function getPublishedArticle(category: CategoryId, slug: string) {
  const row = getDb()
    .prepare('select * from articles where category = ? and slug = ? and status = ?')
    .get(category, slug, 'published')
  return row ? { ...mapArticle(row), bodyZh: readMarkdownBody(row.body_zh_path), bodyEn: row.body_en_path ? readMarkdownBody(row.body_en_path) : null } : null
}

export function listPublishedArticles(category?: CategoryId) {
  const sql = category
    ? 'select * from articles where status = ? and category = ? order by published_at desc, id desc'
    : 'select * from articles where status = ? order by published_at desc, id desc'
  const rows = category ? getDb().prepare(sql).all('published', category) : getDb().prepare(sql).all('published')
  return rows.map(mapArticle)
}

export function listStudioArticles() {
  return getDb().prepare('select * from articles order by updated_at desc, id desc').all().map(mapArticle)
}

export function publishArticle(id: number) {
  getDb().prepare("update articles set status = 'published', published_at = coalesce(published_at, ?), updated_at = ? where id = ?").run(nowIso(), nowIso(), id)
}

export function unpublishArticle(id: number) {
  getDb().prepare("update articles set status = 'draft', updated_at = ? where id = ?").run(nowIso(), id)
}

export function setFeaturedArticle(id: number) {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('update articles set is_featured = 0').run()
    db.prepare('update articles set is_featured = 1 where id = ?').run(id)
  })
  tx()
}

function replaceArticleTags(articleId: number, tagIds: number[]) {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('delete from article_tags where article_id = ?').run(articleId)
    const stmt = db.prepare('insert into article_tags (article_id, tag_id) values (?, ?)')
    for (const tagId of tagIds) stmt.run(articleId, tagId)
  })
  tx()
}
```

- [ ] **Step 4: Implement tags, settings, and search**

Create `src/lib/services/tags.ts`:

```ts
import { getDb } from '@/lib/db/connection'
import { normalizeSlug } from '@/lib/content/slugs'

export function listTags() {
  return getDb().prepare('select id, name, slug from tags order by name').all()
}

export function createTag(name: string) {
  const trimmed = name.trim()
  if (trimmed.length < 1) throw new Error('Tag name is required.')
  const slug = normalizeSlug(trimmed) || encodeURIComponent(trimmed)
  const result = getDb()
    .prepare('insert into tags (name, slug, created_at) values (?, ?, ?)')
    .run(trimmed, slug, new Date().toISOString())
  return { id: Number(result.lastInsertRowid), name: trimmed, slug }
}
```

Create `src/lib/services/settings.ts`:

```ts
import { getDb } from '@/lib/db/connection'

const defaults = {
  siteName: "Arthur's Review",
  contactEmail: 'laoliarthur@outlook.com',
  about: "Arthur's Review is a personal publication for current-affairs notes, social analysis, poems, travel writing, and other things worth keeping.",
  featuredArticleId: '',
  rssDescription: "Arthur's Review, a personal intellectual publication.",
}

export type SettingKey = keyof typeof defaults

export function getSetting(key: SettingKey) {
  const row = getDb().prepare('select value from settings where key = ?').get(key) as { value: string } | undefined
  return row?.value ?? defaults[key]
}

export function setSetting(key: SettingKey, value: string) {
  getDb()
    .prepare('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value')
    .run(key, value)
}

export function getSettings() {
  return Object.fromEntries((Object.keys(defaults) as SettingKey[]).map((key) => [key, getSetting(key)])) as Record<SettingKey, string>
}
```

Create `src/lib/services/search.ts`:

```ts
import { getArticleById, listPublishedArticles } from './articles'

export function searchArticles(query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  return listPublishedArticles().filter((summary) => {
    const article = getArticleById(summary.id, { includeDraft: false }) ?? summary
    const text = [
      article.titleZh,
      article.titleEn,
      article.excerptZh,
      article.excerptEn,
      article.category,
      article.bodyZh,
      article.bodyEn,
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase()
    return text.includes(normalized)
  })
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test tests/content.test.ts tests/search.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/services src/test tests/content.test.ts tests/search.test.ts
git commit -m "feat: add content services"
```

## Task 5: Authentication, Session, CSRF, Proxy Guard

**Files:**
- Create: `src/lib/auth/constants.ts`
- Create: `src/lib/auth/password.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/lib/auth/csrf.ts`
- Create: `src/lib/auth/rate-limit.ts`
- Create: `src/proxy.ts`
- Create: `tests/auth.test.ts`
- Create: `scripts/hash-password.mjs`

- [ ] **Step 1: Write failing auth tests**

Create `tests/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('password hashing', () => {
  it('verifies a scrypt password hash', async () => {
    const { hashPassword, verifyPassword } = await import('@/lib/auth/password')
    const hash = await hashPassword('newus-but-longer')

    await expect(verifyPassword('newus-but-longer', hash)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false)
  })
})

describe('csrf tokens', () => {
  it('accepts matching tokens and rejects mismatches', async () => {
    const { createCsrfToken, verifyCsrfToken } = await import('@/lib/auth/csrf')
    const token = createCsrfToken()

    expect(verifyCsrfToken(token, token)).toBe(true)
    expect(verifyCsrfToken(token, 'bad')).toBe(false)
  })
})

describe('login rate limiter', () => {
  it('blocks after the configured number of failures', async () => {
    const { createRateLimiter } = await import('@/lib/auth/rate-limit')
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 })

    expect(limiter.hit('127.0.0.1').allowed).toBe(true)
    expect(limiter.hit('127.0.0.1').allowed).toBe(true)
    expect(limiter.hit('127.0.0.1').allowed).toBe(false)
  })
})
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm test tests/auth.test.ts
```

Expected: FAIL because auth modules do not exist.

- [ ] **Step 3: Implement password helpers**

Create `src/lib/auth/password.ts`:

```ts
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import 'server-only'

const scrypt = promisify(crypto.scrypt)
const params = { N: 16384, r: 8, p: 1, keylen: 64 }

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  const derived = (await scrypt(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p })) as Buffer
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt') return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const derived = (await scrypt(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })) as Buffer
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived)
}
```

Create `scripts/hash-password.mjs`:

```js
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import readline from 'node:readline/promises'

const scrypt = promisify(crypto.scrypt)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const password = await rl.question('Admin password: ')
rl.close()

const salt = crypto.randomBytes(16)
const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 })
console.log(`scrypt$16384$8$1$${salt.toString('base64')}$${Buffer.from(derived).toString('base64')}`)
```

- [ ] **Step 4: Implement CSRF and rate limiting**

Create `src/lib/auth/csrf.ts`:

```ts
import crypto from 'node:crypto'
import 'server-only'

export function createCsrfToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function verifyCsrfToken(expected: string | undefined, received: string | undefined) {
  if (!expected || !received) return false
  const left = Buffer.from(expected)
  const right = Buffer.from(received)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}
```

Create `src/lib/auth/rate-limit.ts`:

```ts
type Entry = { count: number; resetAt: number }

export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, Entry>()

  return {
    hit(key: string) {
      const now = Date.now()
      const current = hits.get(key)
      if (!current || current.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs })
        return { allowed: true, remaining: max - 1 }
      }
      current.count += 1
      return { allowed: current.count <= max, remaining: Math.max(0, max - current.count) }
    },
    reset(key: string) {
      hits.delete(key)
    },
  }
}
```

- [ ] **Step 5: Implement session helpers**

Create `src/lib/auth/constants.ts`:

```ts
export const sessionCookie = 'arthurs_review_session'
export const csrfCookie = 'arthurs_review_csrf'
```

Create `src/lib/auth/session.ts`:

```ts
import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { sessionCookie, csrfCookie } from './constants'
import { getEnv } from '@/lib/env'

function key() {
  return new TextEncoder().encode(getEnv().SESSION_SECRET)
}

export async function createSession() {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key())
  const store = await cookies()
  store.set(sessionCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt })
}

export async function destroySession() {
  const store = await cookies()
  store.delete(sessionCookie)
  store.delete(csrfCookie)
}

export async function verifySessionCookie(value?: string) {
  if (!value) return false
  try {
    const result = await jwtVerify(value, key(), { algorithms: ['HS256'] })
    return result.payload.role === 'admin'
  } catch {
    return false
  }
}

export async function isAdminSession() {
  const store = await cookies()
  return verifySessionCookie(store.get(sessionCookie)?.value)
}

export async function requireAdmin() {
  if (!(await isAdminSession())) redirect('/studio/login')
}
```

- [ ] **Step 6: Implement proxy guard**

Create `src/proxy.ts`:

```ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { sessionCookie } from '@/lib/auth/constants'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/studio') || pathname === '/studio/login') {
    return NextResponse.next()
  }
  const session = request.cookies.get(sessionCookie)?.value
  if (!session) {
    return NextResponse.redirect(new URL('/studio/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/studio/:path*'],
}
```

Each studio API route must still call `requireAdmin()` or verify the session directly; proxy is only a fast redirect.

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm test tests/auth.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/lib/auth src/proxy.ts scripts/hash-password.mjs tests/auth.test.ts
git commit -m "feat: add studio authentication primitives"
```

## Task 6: Media Upload Processing

**Files:**
- Create: `src/lib/media/paths.ts`
- Create: `src/lib/media/image.ts`
- Create: `src/app/media/[...path]/route.ts`
- Create: `tests/media.test.ts`

- [ ] **Step 1: Write failing media tests**

Create `tests/media.test.ts`:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arthurs-review-media-'))
  process.env.DATA_DIR = tmpDir
  process.env.SITE_URL = 'http://localhost:3000'
  process.env.ADMIN_PASSWORD_HASH = 'scrypt$16384$8$1$c2FsdA==$aGFzaA=='
  process.env.SESSION_SECRET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEF'
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('image uploads', () => {
  it('stores an optimized web image below the uploads directory', async () => {
    const { processImageUpload } = await import('@/lib/media/image')
    const input = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 3,
        background: '#111111',
      },
    })
      .jpeg()
      .toBuffer()

    const result = await processImageUpload(input, 'cover.jpg')

    expect(result.relativePath.startsWith('uploads/')).toBe(true)
    expect(result.relativePath.endsWith('.webp')).toBe(true)
    expect(result.width).toBeLessThanOrEqual(1600)
  })
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm test tests/media.test.ts
```

Expected: FAIL because media modules do not exist.

- [ ] **Step 3: Implement media path helpers**

Create `src/lib/media/paths.ts`:

```ts
import path from 'node:path'
import crypto from 'node:crypto'
import { getDataPaths } from '@/lib/env'
import { safeDataPath } from '@/lib/content/markdown'

export function uploadPublicPath(relativePath: string) {
  return `/media/${relativePath.replace(/^uploads\//, '')}`
}

export function uploadDiskPath(relativePath: string) {
  const paths = getDataPaths()
  return safeDataPath(paths.root, relativePath)
}

export function newUploadPath(extension: string) {
  const date = new Date()
  const folder = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  const file = `${crypto.randomUUID()}.${extension}`
  return path.posix.join('uploads', folder, file)
}
```

- [ ] **Step 4: Implement image processing**

Create `src/lib/media/image.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { ensureDataDirectories } from '@/lib/env'
import { newUploadPath, uploadDiskPath } from './paths'

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function processImageUpload(buffer: Buffer, originalName: string, mimeType = 'image/jpeg') {
  if (!allowed.has(mimeType)) throw new Error('Only JPEG, PNG, and WebP images are allowed.')
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Image must be 8 MB or smaller.')

  ensureDataDirectories()
  const relativePath = newUploadPath('webp')
  const diskPath = uploadDiskPath(relativePath)
  fs.mkdirSync(path.dirname(diskPath), { recursive: true })

  const output = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(diskPath)

  return {
    relativePath,
    width: output.width,
    height: output.height,
    originalName,
  }
}
```

- [ ] **Step 5: Implement media serving route**

Create `src/app/media/[...path]/route.ts`:

```ts
import fs from 'node:fs'
import { NextRequest } from 'next/server'
import { uploadDiskPath } from '@/lib/media/paths'

export async function GET(_request: NextRequest, context: RouteContext<'/media/[...path]'>) {
  const params = await context.params
  const relative = `uploads/${params.path.join('/')}`
  const diskPath = uploadDiskPath(relative)

  if (!fs.existsSync(diskPath)) {
    return new Response('Not found', { status: 404 })
  }

  const body = fs.readFileSync(diskPath)
  return new Response(body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test tests/media.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/media src/app/media tests/media.test.ts
git commit -m "feat: add optimized media uploads"
```

## Task 7: Public Publication UI

**Files:**
- Create: `src/components/Masthead.tsx`
- Create: `src/components/PublicNav.tsx`
- Create: `src/components/ArticleCard.tsx`
- Create: `src/components/ArticleMeta.tsx`
- Create: `src/components/LanguageSwitch.tsx`
- Create: `src/components/ArticleRenderer.tsx`
- Create: `src/components/SearchBox.tsx`
- Create: `src/lib/seo.ts`
- Create: `src/lib/rss.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `src/app/about/page.tsx`
- Create: `src/app/commentary/page.tsx`
- Create: `src/app/commentary/[slug]/page.tsx`
- Create: `src/app/society/page.tsx`
- Create: `src/app/society/[slug]/page.tsx`
- Create: `src/app/misc/page.tsx`
- Create: `src/app/misc/[slug]/page.tsx`
- Create: `src/app/search/page.tsx`
- Create: `src/app/not-found.tsx`
- Create: `src/app/feed.xml/route.ts`
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`
- Create: `e2e/public.spec.ts`

- [ ] **Step 1: Write public e2e tests**

Create `e2e/public.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('home page has classic masthead and five navigation entries', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: "Arthur's Review" })).toBeVisible()
  for (const label of ['Home', '时事评论', '社会分析', '杂七杂八', 'About']) {
    await expect(page.getByRole('link', { name: label })).toBeVisible()
  }
})

test('article without English body hides language switch', async ({ page }) => {
  await page.goto('/commentary/short-note')
  await expect(page.getByText('中文 / English')).toHaveCount(0)
})

test('search returns matching published article', async ({ page }) => {
  await page.goto('/search?q=城市')
  await expect(page.getByRole('link', { name: /城市/ })).toBeVisible()
})
```

- [ ] **Step 2: Run failing e2e tests**

Run:

```bash
pnpm test:e2e e2e/public.spec.ts
```

Expected: FAIL because public pages are still starter pages or content is not seeded.

- [ ] **Step 3: Implement global visual system**

Replace `src/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --paper: #f7f1e6;
  --ink: #111111;
  --muted: #6a6258;
  --rule: #161616;
  --accent: #c81524;
}

html {
  background: var(--paper);
  color: var(--ink);
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: Georgia, "Times New Roman", "Noto Serif SC", serif;
}

a {
  color: inherit;
  text-decoration: none;
}

.sans {
  font-family: Arial, "Noto Sans SC", sans-serif;
}

.container {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px;
}

.rule {
  border-top: 1px solid var(--rule);
}
```

- [ ] **Step 4: Implement shared public components**

Create `src/components/Masthead.tsx`:

```tsx
export function Masthead() {
  return (
    <header className="container pt-8 text-center">
      <h1 className="text-5xl font-bold leading-none md:text-7xl">Arthur&apos;s Review</h1>
      <div className="mx-auto mt-4 h-2 w-24 bg-[var(--accent)]" />
    </header>
  )
}
```

Create `src/components/PublicNav.tsx`:

```tsx
import Link from 'next/link'

const links = [
  ['Home', '/'],
  ['时事评论', '/commentary'],
  ['社会分析', '/society'],
  ['杂七杂八', '/misc'],
  ['About', '/about'],
] as const

export function PublicNav() {
  return (
    <nav className="container sans mt-6 border-y border-[var(--rule)] py-3 text-center text-xs uppercase tracking-[0.14em]">
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
        {links.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
```

Create the article components with stable props:

```tsx
// src/components/ArticleMeta.tsx
import { categoryLabel, type CategoryId } from '@/lib/content/categories'

export function ArticleMeta({ category, publishedAt }: { category: CategoryId; publishedAt: string | null }) {
  return (
    <p className="sans text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
      {categoryLabel(category)}{publishedAt ? ` / ${new Date(publishedAt).toLocaleDateString('zh-CN')}` : ''}
    </p>
  )
}
```

```tsx
// src/components/LanguageSwitch.tsx
import Link from 'next/link'

export function LanguageSwitch({ hasEnglish, currentPath }: { hasEnglish: boolean; currentPath: string }) {
  if (!hasEnglish) return null
  return (
    <span className="sans ml-3 text-xs uppercase tracking-[0.12em]">
      <Link href={currentPath}>中文</Link>
      <span className="mx-2 text-[var(--muted)]">/</span>
      <Link href={`${currentPath}?lang=en`}>English</Link>
    </span>
  )
}
```

```tsx
// src/components/ArticleCard.tsx
import Link from 'next/link'
import { articlePath } from '@/lib/content/urls'
import { uploadPublicPath } from '@/lib/media/paths'
import type { Article } from '@/lib/services/articles'
import { ArticleMeta } from './ArticleMeta'

export function ArticleCard({ article, large = false }: { article: Article; large?: boolean }) {
  return (
    <article className="border-b border-[var(--rule)] py-7">
      {article.coverImagePath ? (
        <img className="mb-5 aspect-[5/3] w-full object-cover" src={uploadPublicPath(article.coverImagePath)} alt="" />
      ) : null}
      <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
      <h2 className={large ? 'mt-3 text-5xl font-bold leading-none' : 'mt-3 text-3xl font-bold leading-tight'}>
        <Link href={articlePath(article.category, article.slug)}>{article.titleZh}</Link>
      </h2>
      {article.excerptZh ? <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--muted)]">{article.excerptZh}</p> : null}
    </article>
  )
}
```

```tsx
// src/components/ArticleRenderer.tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

export function ArticleRenderer({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-neutral max-w-none prose-p:leading-8 prose-img:my-8">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 5: Implement public layout and pages**

Update `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: "Arthur's Review",
    template: "%s | Arthur's Review",
  },
  description: "Arthur's Review, a personal intellectual publication.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
```

Implement `src/app/page.tsx`:

```tsx
import { ArticleCard } from '@/components/ArticleCard'
import { Masthead } from '@/components/Masthead'
import { PublicNav } from '@/components/PublicNav'
import { listPublishedArticles } from '@/lib/services/articles'

export default function HomePage() {
  const articles = listPublishedArticles()
  const featured = articles.find((article) => article.isFeatured) ?? articles[0]
  const feed = articles.filter((article) => article.id !== featured?.id)

  return (
    <>
      <Masthead />
      <PublicNav />
      <main className="container py-10">
        {featured ? (
          <section className="grid gap-8 border-b-2 border-[var(--rule)] pb-8 md:grid-cols-[1.35fr_1fr]">
            <ArticleCard article={featured} large />
            <div>
              {feed.slice(0, 3).map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        ) : null}
        <section className="py-8">
          {feed.slice(3).map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </section>
      </main>
    </>
  )
}
```

Implement article pages by making a shared helper component in each category page file. Example for `src/app/commentary/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { ArticleMeta } from '@/components/ArticleMeta'
import { ArticleRenderer } from '@/components/ArticleRenderer'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { Masthead } from '@/components/Masthead'
import { PublicNav } from '@/components/PublicNav'
import { getPublishedArticle } from '@/lib/services/articles'

export default async function CommentaryArticlePage({ params, searchParams }: PageProps<'/commentary/[slug]'>) {
  const { slug } = await params
  const query = await searchParams
  const article = getPublishedArticle('commentary', slug)
  if (!article) notFound()
  const useEnglish = query.lang === 'en' && article.bodyEn
  return (
    <>
      <Masthead />
      <PublicNav />
      <main className="container max-w-[820px] py-12">
        <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
        <LanguageSwitch hasEnglish={Boolean(article.bodyEn)} currentPath={`/commentary/${article.slug}`} />
        <h1 className="mt-5 text-5xl font-bold leading-none md:text-7xl">{useEnglish ? article.titleEn : article.titleZh}</h1>
        <div className="mt-10">
          <ArticleRenderer markdown={(useEnglish ? article.bodyEn : article.bodyZh) ?? ''} />
        </div>
      </main>
    </>
  )
}
```

Repeat for `src/app/society/[slug]/page.tsx` using category `society` and for `src/app/misc/[slug]/page.tsx` using category `misc`.

- [ ] **Step 6: Implement category, about, search, RSS, sitemap, robots, and health**

Create route-specific category pages that render `listPublishedArticles(category)`: `src/app/commentary/page.tsx`, `src/app/society/page.tsx`, and `src/app/misc/page.tsx`.

Use this shape for each category page:

```tsx
import { ArticleCard } from '@/components/ArticleCard'
import { Masthead } from '@/components/Masthead'
import { PublicNav } from '@/components/PublicNav'
import { listPublishedArticles } from '@/lib/services/articles'

export default function CommentaryPage() {
  const articles = listPublishedArticles('commentary')
  return (
    <>
      <Masthead />
      <PublicNav />
      <main className="container py-10">
        <h1 className="border-b border-[var(--rule)] pb-4 text-5xl font-bold">时事评论</h1>
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} large />
        ))}
      </main>
    </>
  )
}
```

Create `src/app/about/page.tsx` from `getSettings()`, `src/app/search/page.tsx` from `searchArticles()`, `src/app/feed.xml/route.ts` from `listPublishedArticles()`, `src/app/sitemap.ts` using `MetadataRoute.Sitemap`, `src/app/robots.ts`, and `src/app/healthz/route.ts` returning `ok`.

- [ ] **Step 7: Seed sample content**

Create `src/lib/db/seed.ts` and `scripts/seed.mjs` so `pnpm seed` migrates and creates:

- One published featured society article with title `一座城市如何把人训练成旁观者`.
- One published commentary article with slug `short-note`.
- One published misc article with title `夜里写下的几行诗`.
- One draft article not visible publicly.

Run:

```bash
pnpm db:migrate
pnpm seed
pnpm test:e2e e2e/public.spec.ts
```

Expected: public e2e tests PASS.

- [ ] **Step 8: Run checks and commit**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e e2e/public.spec.ts
pnpm build
```

Expected: all pass.

Run:

```bash
git add src e2e scripts package.json pnpm-lock.yaml
git commit -m "feat: build public publication pages"
```

## Task 8: Studio API Routes

**Files:**
- Create: `src/app/studio/api/auth/login/route.ts`
- Create: `src/app/studio/api/auth/logout/route.ts`
- Create: `src/app/studio/api/articles/route.ts`
- Create: `src/app/studio/api/articles/[id]/route.ts`
- Create: `src/app/studio/api/articles/[id]/publish/route.ts`
- Create: `src/app/studio/api/articles/[id]/unpublish/route.ts`
- Create: `src/app/studio/api/media/route.ts`
- Create: `src/app/studio/api/settings/route.ts`
- Create: `src/app/studio/api/tags/route.ts`
- Create: `tests/studio-api.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `tests/studio-api.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('studio API contracts', () => {
  it('rejects unauthenticated article creation', async () => {
    const mod = await import('@/app/studio/api/articles/route')
    const response = await mod.POST(new Request('http://localhost/studio/api/articles', { method: 'POST', body: '{}' }))

    expect(response.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm test tests/studio-api.test.ts
```

Expected: FAIL because API routes do not exist.

- [ ] **Step 3: Implement API helper pattern**

Each mutating studio route follows this shape:

```ts
import { NextRequest } from 'next/server'
import { isAdminSession } from '@/lib/auth/session'

async function requireApiAdmin() {
  if (!(await isAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAdmin()
  if (unauthorized) return unauthorized
  const body = await request.json()
  return Response.json({ ok: true, body })
}
```

Put the repeated `requireApiAdmin` helper in a local module if it is used in more than two routes, for example `src/app/studio/api/_helpers.ts`.

- [ ] **Step 4: Implement auth routes**

`src/app/studio/api/auth/login/route.ts` should:

- Read `{ password }` from JSON.
- Apply the rate limiter using IP from `x-forwarded-for` or `request.headers`.
- Verify against `ADMIN_PASSWORD_HASH`.
- Create session cookie on success.
- Return `{ ok: true }` on success and `{ error: 'Invalid password' }` with 401 on failure.

`src/app/studio/api/auth/logout/route.ts` should destroy the session and return `{ ok: true }`.

- [ ] **Step 5: Implement article routes**

Article routes should call service methods:

- `GET /studio/api/articles`: `listStudioArticles()`.
- `POST /studio/api/articles`: validate body with zod, call `createArticle`.
- `GET /studio/api/articles/[id]`: `getArticleById(id, { includeDraft: true })`.
- `PUT /studio/api/articles/[id]`: validate body, call `updateArticle`.
- `DELETE /studio/api/articles/[id]`: delete article and Markdown files if present.
- `POST /studio/api/articles/[id]/publish`: `publishArticle(id)`.
- `POST /studio/api/articles/[id]/unpublish`: `unpublishArticle(id)`.

Use this zod body schema in a shared API helper:

```ts
import { z } from 'zod'

export const ArticleBodySchema = z.object({
  titleZh: z.string().min(1),
  titleEn: z.string().nullable(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(['commentary', 'society', 'misc']),
  excerptZh: z.string(),
  excerptEn: z.string().nullable(),
  seoDescription: z.string(),
  bodyZh: z.string().min(1),
  bodyEn: z.string().nullable(),
  tagIds: z.array(z.number().int().positive()),
  coverImagePath: z.string().nullable(),
})
```

- [ ] **Step 6: Implement media, tags, and settings routes**

Media route:

- Accept multipart form field `file`.
- Convert `File` to `Buffer`.
- Call `processImageUpload`.
- Return `{ relativePath, publicPath, width, height }`.

Tags route:

- `GET`: `listTags()`.
- `POST`: validate `{ name }`, call `createTag`.

Settings route:

- `GET`: `getSettings()`.
- `PUT`: accept site name, email, about, featured article id, RSS description.
- Update settings and call `setFeaturedArticle` when featured article id is set.

- [ ] **Step 7: Run API tests and checks**

Run:

```bash
pnpm test tests/studio-api.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/app/studio/api tests/studio-api.test.ts
git commit -m "feat: add studio API routes"
```

## Task 9: Studio UI

**Files:**
- Create: `src/app/studio/layout.tsx`
- Create: `src/app/studio/page.tsx`
- Create: `src/app/studio/login/page.tsx`
- Create: `src/app/studio/articles/page.tsx`
- Create: `src/app/studio/articles/new/page.tsx`
- Create: `src/app/studio/articles/[id]/page.tsx`
- Create: `src/app/studio/tags/page.tsx`
- Create: `src/app/studio/settings/page.tsx`
- Create: `src/app/studio/preview/[id]/page.tsx`
- Create: `src/components/studio/ArticleEditor.tsx`
- Create: `src/components/studio/ImageUploader.tsx`
- Create: `src/components/studio/MarkdownEditor.tsx`
- Create: `src/components/studio/PendingButton.tsx`
- Create: `src/components/studio/StudioNav.tsx`
- Create: `src/components/studio/TagPicker.tsx`
- Create: `e2e/studio.spec.ts`

- [ ] **Step 1: Write studio e2e tests**

Create `e2e/studio.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('studio requires login', async ({ page }) => {
  await page.goto('/studio')
  await expect(page).toHaveURL(/\/studio\/login/)
})

test('admin can create draft, preview, publish, and see public article', async ({ page }) => {
  await page.goto('/studio/login')
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? 'admin-password')
  await page.getByRole('button', { name: 'Log in' }).click()

  await page.getByRole('link', { name: 'New article' }).click()
  await page.getByLabel('Chinese title').fill('测试文章')
  await page.getByLabel('Slug').fill('test-article')
  await page.getByLabel('Category').selectOption('commentary')
  await page.getByLabel('Chinese excerpt').fill('这是一篇测试摘要')
  await page.getByLabel('SEO description').fill('测试 SEO 描述')
  await page.getByLabel('Chinese body').fill('这是正文。')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Draft saved')).toBeVisible()
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.goto('/commentary/test-article')
  await expect(page.getByRole('heading', { name: '测试文章' })).toBeVisible()
})
```

- [ ] **Step 2: Run failing e2e tests**

Run:

```bash
E2E_ADMIN_PASSWORD=admin-password pnpm test:e2e e2e/studio.spec.ts
```

Expected: FAIL because studio UI does not exist.

- [ ] **Step 3: Implement studio layout and navigation**

Create `src/components/studio/StudioNav.tsx`:

```tsx
import Link from 'next/link'

export function StudioNav() {
  return (
    <nav className="sans border-b border-[var(--rule)] p-4 text-sm">
      <div className="mx-auto flex max-w-6xl gap-5">
        <Link href="/studio/articles">Articles</Link>
        <Link href="/studio/articles/new">New article</Link>
        <Link href="/studio/tags">Tags</Link>
        <Link href="/studio/settings">Settings</Link>
      </div>
    </nav>
  )
}
```

Create `src/app/studio/layout.tsx`:

```tsx
import { requireAdmin } from '@/lib/auth/session'
import { StudioNav } from '@/components/studio/StudioNav'

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return (
    <>
      <StudioNav />
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </>
  )
}
```

Create a separate login page that does not use this protected layout by moving protected studio routes into a route group if necessary:

```text
src/app/studio/(protected)/layout.tsx
src/app/studio/login/page.tsx
```

If using the route group, keep URLs unchanged.

- [ ] **Step 4: Implement login page**

Create `src/app/studio/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const response = await fetch('/studio/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!response.ok) {
      setError('Invalid password')
      return
    }
    router.push('/studio/articles')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-6 text-4xl font-bold">Studio</h1>
      <form onSubmit={submit} className="grid gap-4">
        <label className="sans grid gap-2 text-sm">
          Password
          <input className="border border-[var(--rule)] bg-white p-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
        <button className="border border-[var(--rule)] bg-[var(--ink)] p-3 text-white">Log in</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 5: Implement editor components**

Create `src/components/studio/ArticleEditor.tsx` as a client component that renders:

- Inputs labeled exactly `Chinese title`, `Slug`, `Category`, `Chinese excerpt`, `SEO description`.
- Textarea labeled `Chinese body`.
- Optional English title/body fields.
- Tag picker.
- Cover image uploader.
- Buttons named `Save draft`, `Preview`, and `Publish`.

Submit JSON to `/studio/api/articles` or `/studio/api/articles/[id]`. On save, show `Draft saved`. On publish, call `/studio/api/articles/[id]/publish`.

- [ ] **Step 6: Implement studio pages**

Pages:

- `/studio`: redirect to `/studio/articles`.
- `/studio/articles`: list all articles with status and edit links.
- `/studio/articles/new`: render empty `ArticleEditor`.
- `/studio/articles/[id]`: load article and render `ArticleEditor`.
- `/studio/preview/[id]`: render draft article with public article component while requiring login.
- `/studio/tags`: list and create tags.
- `/studio/settings`: edit site name, email, about, RSS description, and featured article.

- [ ] **Step 7: Run studio e2e and checks**

Run:

```bash
E2E_ADMIN_PASSWORD=admin-password pnpm test:e2e e2e/studio.spec.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/app/studio src/components/studio e2e/studio.spec.ts
git commit -m "feat: build studio editor"
```

## Task 10: Deployment, Backups, and Server Scripts

**Files:**
- Create: `Dockerfile`
- Create: `deploy/docker-compose.yml`
- Create: `deploy/Caddyfile`
- Create: `deploy/production.env.example`
- Create: `scripts/backup-data.sh`
- Create: `scripts/server-bootstrap.sh`
- Create: `scripts/deploy.sh`
- Modify: `.gitignore`

- [ ] **Step 1: Create Dockerfile**

Create `Dockerfile`:

```Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/lib/db/schema.sql ./src/lib/db/schema.sql
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
CMD ["pnpm", "start"]
```

- [ ] **Step 2: Create Docker Compose and Caddy config**

Create `deploy/docker-compose.yml`:

```yaml
services:
  app:
    build:
      context: ..
      dockerfile: Dockerfile
    env_file:
      - ./production.env
    volumes:
      - /var/www/arthurs-review/data:/data
    restart: unless-stopped
    expose:
      - "3000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app

volumes:
  caddy_data:
  caddy_config:
```

Create `deploy/Caddyfile`:

```caddyfile
blog.leesaitool.com {
  encode zstd gzip
  reverse_proxy app:3000
}
```

Create `deploy/production.env.example`:

```bash
DATA_DIR=/data
SITE_URL=https://blog.leesaitool.com
ADMIN_PASSWORD_HASH=scrypt$16384$8$1$REPLACE_WITH_SALT$REPLACE_WITH_HASH
SESSION_SECRET=replace-with-32-plus-random-characters
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=8
```

- [ ] **Step 3: Create backup script**

Create `scripts/backup-data.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/www/arthurs-review/data}"
BACKUP_DIR="${BACKUP_DIR:-/var/www/arthurs-review/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/arthurs-review-${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"
tar -czf "${DEST}" -C "${DATA_DIR}" arthurs-review.sqlite3 markdown
find "${BACKUP_DIR}" -name 'arthurs-review-*.tar.gz' -mtime +30 -delete
echo "${DEST}"
```

Make executable:

```bash
chmod +x scripts/backup-data.sh
```

- [ ] **Step 4: Create server bootstrap script**

Create `scripts/server-bootstrap.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

apt-get update
apt-get install -y ca-certificates curl ufw rsync git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
mkdir -p /var/www/arthurs-review/data /var/www/arthurs-review/backups /opt/arthurs-review
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Make executable:

```bash
chmod +x scripts/server-bootstrap.sh
```

- [ ] **Step 5: Create deploy script**

Create `scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-root@187.124.247.64}"
APP_DIR="${APP_DIR:-/opt/arthurs-review}"

rsync -az --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude .next \
  --exclude data \
  ./ "${REMOTE}:${APP_DIR}/"

ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose --env-file production.env up -d --build"
ssh "${REMOTE}" "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

Make executable:

```bash
chmod +x scripts/deploy.sh
```

- [ ] **Step 6: Update `.gitignore`**

Ensure `.gitignore` includes:

```gitignore
deploy/production.env
```

- [ ] **Step 7: Run local deployment checks**

Run:

```bash
docker compose -f deploy/docker-compose.yml config
pnpm build
```

Expected: Compose config is valid and Next.js build passes.

- [ ] **Step 8: Commit**

Run:

```bash
git add Dockerfile deploy scripts .gitignore
git commit -m "feat: add Docker and Caddy deployment"
```

## Task 11: Final Local Verification and Visual QA

**Files:**
- Modify only files with defects found during verification.

- [ ] **Step 1: Run the full verification suite**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Start the local app**

Run:

```bash
pnpm dev
```

Expected: app serves at `http://127.0.0.1:3000`.

- [ ] **Step 3: Browser QA**

Use the Browser plugin or Playwright screenshots to verify:

- Desktop home page has centered masthead, red rule, five nav links, featured article, and stacked feed.
- Mobile home page has no horizontal overflow.
- Category page shows large article entries.
- Article page with image renders the image.
- Article page without image has no empty image slot.
- Article with no English body does not show language switching.
- Article with English body shows language switch below title metadata.
- `/studio` redirects to `/studio/login` when logged out.
- Studio create, preview, publish, unpublish, tag creation, settings update, image upload, RSS, sitemap, and search work.

- [ ] **Step 4: Fix verified defects**

For every defect, write a narrow test or e2e assertion first, then fix the code. Example:

```ts
test('home page does not overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})
```

Run the failing test, implement the smallest fix, then rerun the same test.

- [ ] **Step 5: Commit final local fixes**

Run:

```bash
git status --short
git add .
git commit -m "fix: polish local verification issues"
```

If there are no changes, skip the commit and record that the working tree is clean.

## Task 12: Production Deployment and Verification

**Files:**
- Modify: `deploy/production.env` on the server only
- Modify only tracked files if production verification exposes a real code or deploy bug.

- [ ] **Step 1: Prepare production secret values**

Generate a session secret:

```bash
openssl rand -base64 32
```

Generate admin password hash:

```bash
pnpm hash-password
```

Expected: you get one `SESSION_SECRET` and one `ADMIN_PASSWORD_HASH`.

- [ ] **Step 2: Bootstrap the server**

Run:

```bash
ssh root@187.124.247.64 'bash -s' < scripts/server-bootstrap.sh
```

Expected: Docker, Compose plugin, firewall, and app directories are ready.

- [ ] **Step 3: Create server production env**

Create `/opt/arthurs-review/deploy/production.env` on the server with:

```bash
DATA_DIR=/data
SITE_URL=https://blog.leesaitool.com
ADMIN_PASSWORD_HASH=<generated hash>
SESSION_SECRET=<generated secret>
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=8
```

Use `chmod 600 /opt/arthurs-review/deploy/production.env`.

- [ ] **Step 4: Update Porkbun DNS**

In Porkbun DNS, set:

```text
Type: A
Host: blog
Answer: 187.124.247.64
TTL: 600
```

Remove the stale `blog` record that points at the old server.

- [ ] **Step 5: Deploy**

Run:

```bash
REMOTE=root@187.124.247.64 ./scripts/deploy.sh
```

Expected: app and Caddy containers are running.

- [ ] **Step 6: Verify DNS and HTTPS**

Run:

```bash
dig +short blog.leesaitool.com
curl -I http://blog.leesaitool.com
curl -I https://blog.leesaitool.com/healthz
```

Expected:

- `dig` returns `187.124.247.64`.
- HTTP returns a redirect to HTTPS.
- HTTPS `/healthz` returns 200.

- [ ] **Step 7: Verify production behavior**

Run:

```bash
curl -I https://blog.leesaitool.com
curl -I https://blog.leesaitool.com/feed.xml
curl -I https://blog.leesaitool.com/sitemap.xml
curl -I https://blog.leesaitool.com/studio
```

Expected:

- Home, RSS, and sitemap return 200.
- `/studio` redirects to `/studio/login` or returns a protected login flow.

- [ ] **Step 8: Verify backup**

Run:

```bash
ssh root@187.124.247.64 'DATA_DIR=/var/www/arthurs-review/data BACKUP_DIR=/var/www/arthurs-review/backups /opt/arthurs-review/scripts/backup-data.sh && ls -lh /var/www/arthurs-review/backups | tail'
```

Expected: a tarball exists and contains SQLite plus Markdown but not uploaded images.

- [ ] **Step 9: Commit production fixes**

If deployment required tracked file changes:

```bash
git status --short
git add .
git commit -m "fix: production deployment verification"
```

If no tracked files changed, leave the repository clean.

## Final Handoff Checklist

- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm test:e2e` passes.
- [ ] `pnpm build` passes.
- [ ] Desktop and mobile browser QA completed.
- [ ] `blog.leesaitool.com` resolves to `187.124.247.64`.
- [ ] HTTP redirects to HTTPS.
- [ ] Caddy has issued a valid certificate.
- [ ] `/studio` requires login.
- [ ] Published article is public.
- [ ] Draft article is not public.
- [ ] RSS and sitemap load.
- [ ] Backup job excludes uploaded images.
- [ ] Working tree is clean.
