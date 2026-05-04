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
