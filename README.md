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

`pnpm test:e2e` runs the Playwright suite against a fresh temp `DATA_DIR`, seeded before the dev server starts.

## Deployment

Production is designed for Docker Compose on the VPS behind Caddy:

```bash
ssh root@72.60.195.46 'bash -s' < scripts/server-bootstrap.sh
REMOTE=root@72.60.195.46 ./scripts/deploy.sh
```

Runtime data is mounted at `/var/www/arthurs-review/data` on the host and `/data` in the app container. Caddy serves `blog.leesaitool.com` with automatic HTTPS.

Pushes to `main` deploy through GitHub Actions. Required repository secrets:

- `DEPLOY_SSH_PRIVATE_KEY`: private key allowed to SSH into the VPS
- `PRODUCTION_ENV`: contents of `deploy/production.env`
- `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `WORKER_REVALIDATE_SECRET`

Optional repository variables: `DEPLOY_HOST`, `DEPLOY_REMOTE`, `DEPLOY_APP_DIR`.

## Backups

`scripts/server-bootstrap.sh` installs a daily cron job named `arthurs-review-backup`.

Manual backup:

```bash
DATA_DIR=/var/www/arthurs-review/data BACKUP_DIR=/var/www/arthurs-review/backups APP_DIR=/opt/arthurs-review scripts/backup-data.sh
```

Each archive contains an online SQLite snapshot plus `markdown/`, `uploads/`, `proofs/`, and a SHA-256 manifest. Verify one without restoring it:

```bash
scripts/verify-backup.sh /var/www/arthurs-review/backups/arthurs-review-YYYYMMDDTHHMMSSZ.tar.gz
```

The VPS keeps 30 days of daily archives. `.github/workflows/backup.yml` also downloads, verifies, and stores the latest archive as a 30-day GitHub Actions artifact so a server loss does not take the only backup with it.
