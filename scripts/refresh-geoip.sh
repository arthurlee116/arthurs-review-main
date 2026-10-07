#!/usr/bin/env bash
set -Eeuo pipefail
# Server-side maintenance: the VPS runs Compose; local container builds use Apple's container CLI.
APP_DIR="${APP_DIR:-/opt/arthurs-review}"
exec 9>"/var/lock/arthurs-review-maintenance.lock"
flock -w 600 9
cd "${APP_DIR}/deploy"
docker compose exec -T app pnpm geoip:update
