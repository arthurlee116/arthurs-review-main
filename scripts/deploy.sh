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
  ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose build app && docker compose up -d app worker && docker pull caddy:2-alpine >/dev/null && docker run --rm -v ${APP_DIR}/deploy/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile"
else
  ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose up -d --build"
fi
ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose up -d caddy && docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile"
ssh "${REMOTE}" "cd ${APP_DIR}/deploy && for i in \$(seq 1 60); do docker compose exec -T app sh -lc 'wget -qO- http://127.0.0.1:3000/healthz' | grep -q '\"ok\":true' && exit 0; sleep 2; done; docker compose logs --tail=80 app; exit 1"

PUBLIC_URL="${PUBLIC_URL:-https://blog.leesaitool.com}"
PUBLIC_HEADER_FILE="$(mktemp)"
trap 'rm -f "${PUBLIC_HEADER_FILE}"' EXIT
PUBLIC_HEADERS_OK=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 15 -D "${PUBLIC_HEADER_FILE}" -o /dev/null "${PUBLIC_URL}/healthz" \
    && grep -qi '^strict-transport-security:' "${PUBLIC_HEADER_FILE}" \
    && grep -qi '^x-content-type-options:' "${PUBLIC_HEADER_FILE}" \
    && grep -qi '^referrer-policy:' "${PUBLIC_HEADER_FILE}" \
    && grep -qi '^content-security-policy:.*frame-ancestors' "${PUBLIC_HEADER_FILE}" \
    && grep -qi '^permissions-policy:.*camera=()' "${PUBLIC_HEADER_FILE}" \
    && ! grep -qi '^x-powered-by:' "${PUBLIC_HEADER_FILE}"; then
    PUBLIC_HEADERS_OK=1
    break
  fi
  sleep 2
done
if [[ "${PUBLIC_HEADERS_OK}" != "1" ]]; then
  echo "Public security-header probe failed for ${PUBLIC_URL}." >&2
  cat "${PUBLIC_HEADER_FILE}" >&2
  exit 1
fi
rm -f "${PUBLIC_HEADER_FILE}"
trap - EXIT

ssh "${REMOTE}" "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
