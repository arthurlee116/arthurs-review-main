#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-root@72.60.195.46}"
APP_DIR="${APP_DIR:-/opt/arthurs-review}"
APP_ONLY="${APP_ONLY:-0}"

if [[ ! -f deploy/production.env ]]; then
  echo "Missing deploy/production.env. Create it from deploy/production.env.example before deploying." >&2
  exit 1
fi

ssh "${REMOTE}" '
set -eu
if command -v sqlite3 >/dev/null 2>&1; then
  exit 0
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y sqlite3 >/dev/null
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache sqlite >/dev/null
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y sqlite >/dev/null
elif command -v yum >/dev/null 2>&1; then
  yum install -y sqlite >/dev/null
else
  echo "No supported package manager is available to install sqlite3." >&2
  exit 127
fi
command -v sqlite3 >/dev/null
'

rsync -az --delete \
  --exclude .git \
  --exclude .codegraph \
  --exclude node_modules \
  --exclude .next \
  --exclude .ops-secrets \
  --exclude .playwright-mcp \
  --exclude data \
  --exclude test-results \
  --exclude playwright-report \
  --exclude '/*.png' \
  ./ "${REMOTE}:${APP_DIR}/"

if [[ "${APP_ONLY}" == "1" ]]; then
  ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose build app && docker compose up -d app && docker pull caddy:2-alpine >/dev/null && docker run --rm -v ${APP_DIR}/deploy/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile"
else
  ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose up -d --build"
fi
ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose up -d caddy && docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile"
ssh "${REMOTE}" "cd ${APP_DIR}/deploy && for i in \$(seq 1 60); do docker compose exec -T app sh -lc 'wget -qO- http://127.0.0.1:3000/healthz' | grep -q '\"ok\":true' && exit 0; sleep 2; done; docker compose logs --tail=80 app; exit 1"
ssh "${REMOTE}" "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
