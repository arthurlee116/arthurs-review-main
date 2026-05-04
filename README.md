# Arthur's Review

Arthur's Review is a single-user Next.js publication app for Arthur's writing. Public content is read from SQLite metadata plus Markdown body files under `DATA_DIR`; editing happens in the private `/studio` backend.

## Local Setup

```bash
pnpm install
pnpm db:migrate
pnpm seed
pnpm dev
```

Required environment variables:

- `DATA_DIR`: persistent app data directory, for example `./data`
- `SITE_URL`: canonical public URL, for example `https://blog.leesaitool.com`
- `ADMIN_PASSWORD_HASH`: generated with `pnpm hash-password`
- `SESSION_SECRET`: 32+ random characters

See `.env.example` and `deploy/production.env.example`.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
docker compose -f deploy/docker-compose.yml config
```

The Playwright suite seeds `DATA_DIR=./data/e2e` before starting the dev server.

## Deployment

Production is designed for Docker Compose on the VPS behind Caddy:

```bash
ssh root@187.124.247.64 'bash -s' < scripts/server-bootstrap.sh
REMOTE=root@187.124.247.64 ./scripts/deploy.sh
```

Runtime data is mounted at `/var/www/arthurs-review/data` on the host and `/data` in the app container. Caddy serves `blog.leesaitool.com` with automatic HTTPS.

Pushes to `main` deploy through GitHub Actions. Required repository secrets:

- `DEPLOY_SSH_PRIVATE_KEY`: private key allowed to SSH into the VPS
- `PRODUCTION_ENV`: contents of `deploy/production.env`

Optional repository variables: `DEPLOY_HOST`, `DEPLOY_REMOTE`, `DEPLOY_APP_DIR`.

## Backups

`scripts/server-bootstrap.sh` installs a daily cron job named `arthurs-review-backup`.

Manual backup:

```bash
DATA_DIR=/var/www/arthurs-review/data BACKUP_DIR=/var/www/arthurs-review/backups scripts/backup-data.sh
```

Backups include SQLite and Markdown files. Uploaded images are intentionally excluded.
