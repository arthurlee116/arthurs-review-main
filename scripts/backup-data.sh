#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/www/arthurs-review/data}"
BACKUP_DIR="${BACKUP_DIR:-/var/www/arthurs-review/backups}"
APP_DIR="${APP_DIR:-/opt/arthurs-review}"
COMPOSE_DIR="${COMPOSE_DIR:-${APP_DIR}/deploy}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/arthurs-review-${STAMP}.tar.gz"
PARTIAL="${DEST}.partial"
SNAPSHOT_NAME="arthurs-review-${STAMP}.sqlite3"
SNAPSHOT_HOST_PATH="${DATA_DIR}/backups/${SNAPSHOT_NAME}"
SNAPSHOT_CONTAINER_PATH="/data/backups/${SNAPSHOT_NAME}"

mkdir -p "${BACKUP_DIR}"
STAGING_DIR="$(mktemp -d "${BACKUP_DIR}/.arthurs-review-${STAMP}.XXXXXX")"
APP_STOPPED=0
cleanup() {
  exit_code=$?
  trap - EXIT
  if [[ "${APP_STOPPED}" == "1" ]]; then
    (
      cd "${COMPOSE_DIR}"
      docker compose start app >/dev/null
    ) || true
  fi
  rm -rf "${STAGING_DIR}" "${PARTIAL}" "${SNAPSHOT_HOST_PATH}"
  return "${exit_code}"
}
trap cleanup EXIT

if (
  cd "${COMPOSE_DIR}"
  docker compose ps --status running --services | grep -qx app
); then
  (
    cd "${COMPOSE_DIR}"
    docker compose stop app >/dev/null
  )
  APP_STOPPED=1
fi

(
  cd "${COMPOSE_DIR}"
  docker compose run --rm --no-deps app pnpm exec tsx scripts/backup-database.ts "${SNAPSHOT_CONTAINER_PATH}" >/dev/null
)

cp "${SNAPSHOT_HOST_PATH}" "${STAGING_DIR}/arthurs-review.sqlite3"
for directory in markdown uploads proofs; do
  mkdir -p "${STAGING_DIR}/${directory}"
  if [[ -d "${DATA_DIR}/${directory}" ]]; then
    rsync -a "${DATA_DIR}/${directory}/" "${STAGING_DIR}/${directory}/"
  fi
done

if [[ "${APP_STOPPED}" == "1" ]]; then
  (
    cd "${COMPOSE_DIR}"
    docker compose up -d app >/dev/null
    healthy=0
    for _attempt in $(seq 1 60); do
      if docker compose exec -T app sh -lc 'wget -qO- http://127.0.0.1:3000/healthz' | grep -q '"ok":true'; then
        healthy=1
        break
      fi
      sleep 1
    done
    if [[ "${healthy}" != "1" ]]; then
      docker compose logs --tail=80 app >&2
      exit 1
    fi
  )
  APP_STOPPED=0
fi

(
  cd "${STAGING_DIR}"
  find arthurs-review.sqlite3 markdown uploads proofs -type f -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256
)

tar -czf "${PARTIAL}" -C "${STAGING_DIR}" arthurs-review.sqlite3 markdown uploads proofs MANIFEST.sha256
"$(dirname "$0")/verify-backup.sh" "${PARTIAL}" >/dev/null
mv "${PARTIAL}" "${DEST}"
find "${BACKUP_DIR}" -name 'arthurs-review-*.tar.gz' -mtime +30 -delete
cleanup
echo "${DEST}"
