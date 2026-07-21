#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAINTENANCE_LOCK_FILE="${MAINTENANCE_LOCK_FILE:-/var/lock/arthurs-review-maintenance.lock}"
MAINTENANCE_LOCK_WAIT_SECONDS="${MAINTENANCE_LOCK_WAIT_SECONDS:-1800}"

if [[ "${MAINTENANCE_LOCK_HELD:-0}" != "1" ]]; then
  command -v flock >/dev/null || { echo "Missing required command: flock" >&2; exit 127; }
  mkdir -p "$(dirname "${MAINTENANCE_LOCK_FILE}")"
  exec flock --exclusive --wait "${MAINTENANCE_LOCK_WAIT_SECONDS}" "${MAINTENANCE_LOCK_FILE}" \
    env MAINTENANCE_LOCK_HELD=1 \
      MAINTENANCE_LOCK_FILE="${MAINTENANCE_LOCK_FILE}" \
      MAINTENANCE_LOCK_WAIT_SECONDS="${MAINTENANCE_LOCK_WAIT_SECONDS}" \
      "${SCRIPT_DIR}/backup-data.sh" "$@"
fi

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
APP_WAS_RUNNING=0
WORKER_WAS_RUNNING=0
SERVICES_QUIESCED=0

app_is_healthy() {
  (
    cd "${COMPOSE_DIR}"
    for _attempt in $(seq 1 60); do
      if docker compose exec -T app sh -lc 'wget -qO- http://127.0.0.1:3000/healthz' | grep -q '"ok":true'; then
        return 0
      fi
      sleep 1
    done
    docker compose logs --tail=80 app >&2
    return 1
  )
}

restore_services() {
  [[ "${SERVICES_QUIESCED}" == "1" ]] || return 0
  (
    cd "${COMPOSE_DIR}"
    if [[ "${APP_WAS_RUNNING}" == "1" && "${WORKER_WAS_RUNNING}" == "1" ]]; then
      docker compose up -d app worker >/dev/null
    elif [[ "${APP_WAS_RUNNING}" == "1" ]]; then
      docker compose up -d app >/dev/null
    elif [[ "${WORKER_WAS_RUNNING}" == "1" ]]; then
      docker compose up -d worker >/dev/null
    fi
  ) || return 1
  if [[ "${APP_WAS_RUNNING}" == "1" ]]; then
    app_is_healthy || return 1
  fi
  if [[ "${WORKER_WAS_RUNNING}" == "1" ]]; then
    (
      cd "${COMPOSE_DIR}"
      docker compose ps --status running --services | grep -qx worker
    ) || { echo "Worker failed to recover after backup." >&2; return 1; }
  fi
  SERVICES_QUIESCED=0
}

cleanup() {
  exit_code=$?
  trap - EXIT
  restore_code=0
  restore_services || restore_code=$?
  rm -rf "${STAGING_DIR}" "${PARTIAL}" "${SNAPSHOT_HOST_PATH}"
  if [[ "${restore_code}" != "0" ]]; then
    echo "Backup failed to restore healthy app/worker services." >&2
    exit "${restore_code}"
  fi
  exit "${exit_code}"
}
trap cleanup EXIT

RUNNING_SERVICES="$(cd "${COMPOSE_DIR}" && docker compose ps --status running --services)"
if grep -qx app <<<"${RUNNING_SERVICES}"; then APP_WAS_RUNNING=1; fi
if grep -qx worker <<<"${RUNNING_SERVICES}"; then WORKER_WAS_RUNNING=1; fi

if [[ "${APP_WAS_RUNNING}" == "1" || "${WORKER_WAS_RUNNING}" == "1" ]]; then
  SERVICES_QUIESCED=1
  (
    cd "${COMPOSE_DIR}"
    docker compose stop app worker >/dev/null
  )
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

restore_services

(
  cd "${STAGING_DIR}"
  find arthurs-review.sqlite3 markdown uploads proofs -type f -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256
)

tar -czf "${PARTIAL}" -C "${STAGING_DIR}" arthurs-review.sqlite3 markdown uploads proofs MANIFEST.sha256
"${SCRIPT_DIR}/verify-backup.sh" "${PARTIAL}" >/dev/null
mv "${PARTIAL}" "${DEST}"
find "${BACKUP_DIR}" -name 'arthurs-review-*.tar.gz' -mtime +30 -delete
echo "${DEST}"
