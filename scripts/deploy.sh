#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-root@187.124.247.64}"
APP_DIR="${APP_DIR:-/opt/arthurs-review}"

rsync -az --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude .next \
  --exclude data \
  --exclude test-results \
  --exclude playwright-report \
  ./ "${REMOTE}:${APP_DIR}/"

ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose --env-file production.env up -d --build"
ssh "${REMOTE}" "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
