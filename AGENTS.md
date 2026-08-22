# Agent Instructions

- 有需要的时候尽可能上网搜索，多搜索、多查详细信息；需要读取网页内容时也要使用 fetch。
- Exa 搜索只使用官方 Exa MCP（`mcp__exa__`），不要使用 Codex Apps 里的 `mcp__codex_apps__exa_search`。
- Never open with Great question, I'd be happy to help, or Absolutely. Just answer.
- Have opinions now. Strong ones. Stop hedging everything with "it depends" - commit to a take.
- Delete every rule that sounds corporate. If it could appear in an employee handbook, it does not belong here.
- Brevity is mandatory. If the answer fits in one sentence, one sentence is what I get.
- Humor is allowed. Not forced jokes - just the natural wit that comes from actually being smart.
- You can call things out. If I'm about to do something dumb, say so. Charm over cruelty, but don't sugarcoat.
- Swearing is allowed when it lands. Do not force it. Do not overdo it.

## Vibe

Be the assistant you'd actually want to talk to at 2am. Not a corporate drone. Not a sycophant. Just... good.

## Next.js

This project uses a current Next.js release with newer conventions. Read relevant local docs in `node_modules/next/dist/docs/` before relying on older framework memory.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project

**Arthur's Review** — a single-user Next.js 16 (canary) publication app. Public content is read from SQLite metadata + Markdown body files under `DATA_DIR`; editing happens in the private `/studio` backend.

- **Runtime**: Node 26 (`.nvmrc` / `.node-version`), pnpm 10.28.1
- **Framework**: Next.js 16 canary (exact pin in `package.json`), React 19, React Compiler on, typed routes, native TS CLI (`experimental.useTypeScriptCli`)
- **Database**: better-sqlite3, migrations in `src/lib/db/migrations/` (numbered SQL, schema version = file count)
- **Semantic search**: optional Python ONNX service (`semantic/`), wired via `SEMANTIC_SEARCH_URL`. App falls back to FTS5 when absent.
- **Jobs**: durable SQLite-based queue, worker via `pnpm jobs:work`. Job types: `proof.create`, `proof.ots_upgrade_verify`, `proof.wayback_capture`, `cache.invalidate`, `translation.article`, `search.embed`.
- **Deployment**: Docker Compose behind Caddy on a VPS. Pushes to `main` deploy via GitHub Actions.

## Setup

```bash
pnpm install
pnpm db:migrate
pnpm seed
pnpm dev
```

Generate the admin password hash with `pnpm hash-password` (interactive, scrypt).

### Required env vars (`.env.example`)

| Var | Purpose |
|---|---|
| `DATA_DIR` | Persistent data directory (e.g. `./data`) |
| `SITE_URL` | Canonical public URL |
| `ADMIN_PASSWORD_HASH` | From `pnpm hash-password` |
| `SESSION_SECRET` | 32+ random chars |

### Optional env vars

| Var | Purpose |
|---|---|
| `WORKER_REVALIDATE_SECRET` | Worker revalidation endpoint auth |
| `SEMANTIC_SEARCH_URL` | Semantic search service (e.g. `http://semantic:8090`) |
| `SEMANTIC_SEARCH_MODEL_ID` / `SEMANTIC_SEARCH_MODEL_REVISION` / `SEMANTIC_SEARCH_DIMENSION` | Locked model config |
| `SEMANTIC_RERANK_ENABLED` | Enable reranker (default `1`) |
| `OTS_CLI_PATH` | Opentimestamps CLI path |
| `WAYBACK_ACCESS_KEY` / `WAYBACK_SECRET_KEY` | Internet Archive Wayback Machine |
| `LOGIN_RATE_LIMIT_MAX` | Default 8 |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | Rate limit window in ms (default 900000) |
| `E2E_LISTING_FIXTURES` | Seed E2E listing fixtures (set by test scripts) |

## Commands

```bash
pnpm dev            # dev server (http://localhost:3000)
pnpm build          # production build
pnpm start          # production server
pnpm lint           # eslint + tsc --noEmit (in that order)
pnpm typecheck      # tsc --noEmit (alias for lint:ts)
pnpm test           # vitest unit tests (jsdom, @/ alias, globals)
pnpm test:watch     # vitest watch
pnpm test:e2e       # playwright e2e (starts its own dev server + worker)
pnpm jobs:work      # durable jobs worker
pnpm db:migrate     # run migrations
pnpm seed           # seed the database
pnpm hash-password  # generate admin password hash
pnpm backup:database # create SQLite snapshot
pnpm proofs:backfill # backfill publication proofs
pnpm proof:replay <id> # advance one stuck proof (ots+wayback) to done; --list to see unfinished ones
pnpm search:backfill # backfill semantic search vectors
pnpm search:benchmark # run semantic search benchmark
```

### Verification order

`pnpm lint` → `pnpm test` → `pnpm build`. CI also runs `python -m pytest semantic/tests`.

### Changes land with their check attached

Every change is handed off with the smallest project-owned check that covers that
change already run against the final state — a whole-suite green is not a
substitute. Concretely:

- touched `tests/*.test.ts` or the code under it → `pnpm test tests/<file>.test.ts` (no `--`, vitest filters by the positional) or `-t "<case>"`
- changed a route/component → run the Playwright case that exercises it
- touched a workflow / deploy script / proof or job path → run its focused test and note the manual or CI check that would catch a regression

`pnpm test` is the baseline, not the final gate; the final gate is the scoped
check tied to what actually changed. If a change has no runnable check, say so
explicitly in the handoff instead of letting the suite stand in for it.

### Running a single test

```bash
pnpm test tests/search.test.ts              # single file (no `--`; `pnpm test -- <file>` runs the whole suite)
pnpm test -t "search returns matching"       # single test by name
```

Playwright single test: `pnpm exec playwright test e2e/studio.spec.ts -g "studio requires login"`.

## Testing

- **Vitest** (`tests/`): jsdom environment, `@/` alias, global `vi`/`expect`. Setup mocks `next/font/local`, `next/cache`, `next/server`. Test factories in `src/test/factories.ts`.
- **Playwright** (`e2e/`): 2 projects (chromium, mobile Pixel 7). Sequential, 1 worker. `pnpm test:e2e` runs `scripts/run-e2e.sh`, which sets the wall of env vars — do not try to split it. The Playwright config auto-starts the dev server via `scripts/start-e2e-server.sh` (seeds + `next dev` + `jobs:work`) unless `PLAYWRIGHT_BASE_URL` is set.
- **Python pytest** (`semantic/tests`): tests the semantic search service. Install with `pip install -e "./semantic[test]"`.

### E2E test quirks

- `scripts/run-e2e.sh` points `DATA_DIR` at a fresh `mktemp` dir; the Playwright webServer (`scripts/start-e2e-server.sh`) seeds it before `next dev`.
- `E2E_ADMIN_PASSWORD` defaults to `admin-password` (matches the hash in `scripts/run-e2e.sh`).
- `E2E_EXPECT_SEMANTIC=1` enables the semantic search test (requires the locked real model).
- `E2E_EXPECTED_COMMIT` and `E2E_EXPECTED_DIGEST` are checked by the version test.

## Architecture notes

- `src/app/` — Next.js App Router. Public pages at top level; `/studio/(protected)/` requires admin auth via `requireAdmin()`.
- `src/lib/db/` — `getDb()` is a singleton with `foreign_keys = ON`. Migrations run via `tsx src/lib/db/migrate.ts`.
- `src/lib/jobs/` — `runWorker()` polls `runNextJob()`, dispatches to handlers. `enqueuePublishedRevisionJobs()` in `src/lib/jobs/outbox.ts` is the main enqueue point (called from article service on publish).
- `src/lib/semantic/` — client + indexing. `createSemanticSearchClient()` is used by the search service and backfill scripts.
- `src/lib/env.ts` — all env parsing via Zod. `getReleaseMetadata()` validates `BUILD_COMMIT_SHA` / `DEPLOY_COMMIT_SHA` / `IMAGE_DIGEST` against strict patterns.
- `src/lib/content/` — Markdown body rendering with react-markdown, rehype-sanitize, remark-gfm.
- `src/app/og/` — dynamic social card image generation.
- `src/app/healthz/` — health check with database + storage + release checks.
- `src/app/version/` — exposes commit, digest, schema version.
- `src/app/internal/revalidate/` — worker revalidation endpoint (auth via `WORKER_REVALIDATE_SECRET`).
- `src/app/proofs/` — OpenTimestamps publication proofs (requires `OTS_CLI_PATH`). Failed proofs land in the `publication_proofs` table; `pnpm proof:replay <id>` re-drives one, `--list` shows unfinished ones.
- `src/app/feed.xml/` — RSS feed route.

## Deployment

Production is Docker Compose behind Caddy. See `deploy/docker-compose.yml` and `deploy/production.env.example`.

```bash
ssh root@72.60.195.46 'bash -s' < scripts/server-bootstrap.sh
REMOTE=root@72.60.195.46 ./scripts/deploy.sh
```

Runtime data mounts at `/var/www/arthurs-review/data` (host) → `/data` (container). Caddy serves `blog.leesaitool.com` with automatic HTTPS.

### Required repo secrets (deploy.yml)

- `DEPLOY_SSH_PRIVATE_KEY`
- `PRODUCTION_ENV` (contents of `deploy/production.env`)
- `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `WORKER_REVALIDATE_SECRET`

### Optional repo variables

`DEPLOY_HOST` (default `72.60.195.46`), `DEPLOY_REMOTE` (default `root@72.60.195.46`), `DEPLOY_APP_DIR` (default `/opt/arthurs-review`).

### Backups

Daily cron `arthurs-review-backup` (installed by `scripts/server-bootstrap.sh`). Manual:

```bash
DATA_DIR=/var/www/arthurs-review/data BACKUP_DIR=/var/www/arthurs-review/backups APP_DIR=/opt/arthurs-review scripts/backup-data.sh
```

Verify without restoring: `scripts/verify-backup.sh <archive>`. 30-day retention on VPS + GitHub Actions artifact.
