#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MAINTENANCE_LOCK_FILE="${MAINTENANCE_LOCK_FILE:-/var/lock/arthurs-review-maintenance.lock}"
MAINTENANCE_LOCK_WAIT_SECONDS="${MAINTENANCE_LOCK_WAIT_SECONDS:-1800}"
PRODUCTION_DATA_DIR="${PRODUCTION_DATA_DIR:-/var/www/arthurs-review/data}"

usage() {
  echo "Usage: restore-backup.sh <backup.tar.gz> [--target <directory>] [--image <name@sha256:digest> --expected-commit <sha> --expected-digest <sha256:digest> --expected-schema <version>]" >&2
}

ARCHIVE="${1:-}"
[[ -n "${ARCHIVE}" ]] || { usage; exit 1; }
shift

TARGET=""
IMAGE=""
EXPECTED_COMMIT=""
EXPECTED_DIGEST=""
EXPECTED_SCHEMA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --image) IMAGE="${2:-}"; shift 2 ;;
    --expected-commit) EXPECTED_COMMIT="${2:-}"; shift 2 ;;
    --expected-digest) EXPECTED_DIGEST="${2:-}"; shift 2 ;;
    --expected-schema) EXPECTED_SCHEMA="${2:-}"; shift 2 ;;
    *) usage; exit 1 ;;
  esac
done

if [[ "${MAINTENANCE_LOCK_HELD:-0}" != "1" ]]; then
  command -v flock >/dev/null || { echo "Missing required command: flock" >&2; exit 127; }
  mkdir -p "$(dirname "${MAINTENANCE_LOCK_FILE}")"
  REEXEC_ARGS=("${ARCHIVE}")
  if [[ -n "${TARGET}" ]]; then REEXEC_ARGS+=(--target "${TARGET}"); fi
  if [[ -n "${IMAGE}" ]]; then
    REEXEC_ARGS+=(
      --image "${IMAGE}"
      --expected-commit "${EXPECTED_COMMIT}"
      --expected-digest "${EXPECTED_DIGEST}"
      --expected-schema "${EXPECTED_SCHEMA}"
    )
  fi
  exec flock --exclusive --wait "${MAINTENANCE_LOCK_WAIT_SECONDS}" "${MAINTENANCE_LOCK_FILE}" \
    env MAINTENANCE_LOCK_HELD=1 \
      MAINTENANCE_LOCK_FILE="${MAINTENANCE_LOCK_FILE}" \
      MAINTENANCE_LOCK_WAIT_SECONDS="${MAINTENANCE_LOCK_WAIT_SECONDS}" \
      PRODUCTION_DATA_DIR="${PRODUCTION_DATA_DIR}" \
      "${SCRIPT_DIR}/restore-backup.sh" "${REEXEC_ARGS[@]}"
fi

[[ -f "${ARCHIVE}" ]] || { echo "Backup archive does not exist: ${ARCHIVE}" >&2; exit 1; }

CLEAN_TARGET=0
if [[ -z "${TARGET}" ]]; then
  TARGET="$(mktemp -d)"
  CLEAN_TARGET=1
else
  mkdir -p "${TARGET}"
fi

TARGET_REAL="$(cd "${TARGET}" && pwd -P)"
if [[ -d "${PRODUCTION_DATA_DIR}" ]]; then
  PRODUCTION_REAL="$(cd "${PRODUCTION_DATA_DIR}" && pwd -P)"
else
  PRODUCTION_REAL="${PRODUCTION_DATA_DIR%/}"
fi
case "${TARGET_REAL}" in
  "${PRODUCTION_REAL}"|"${PRODUCTION_REAL}"/*)
    echo "Refusing to restore into the production data directory." >&2
    exit 1
    ;;
esac

if find "${TARGET_REAL}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  echo "Restore target must be empty: ${TARGET_REAL}" >&2
  exit 1
fi

DRILL_CONTAINER=""
HEALTH_RESPONSE=""
VERSION_RESPONSE=""
cleanup() {
  exit_code=$?
  trap - EXIT
  if [[ -n "${DRILL_CONTAINER}" ]]; then
    docker rm -f "${DRILL_CONTAINER}" >/dev/null 2>&1 || true
  fi
  rm -f "${HEALTH_RESPONSE}" "${VERSION_RESPONSE}"
  if [[ "${CLEAN_TARGET}" == "1" ]]; then
    rm -rf "${TARGET_REAL}"
  fi
  exit "${exit_code}"
}
trap cleanup EXIT

"${SCRIPT_DIR}/verify-backup.sh" "${ARCHIVE}" >/dev/null
tar -xzf "${ARCHIVE}" -C "${TARGET_REAL}"
INTEGRITY="$(sqlite3 "${TARGET_REAL}/arthurs-review.sqlite3" 'PRAGMA integrity_check;')"
[[ "${INTEGRITY}" == "ok" ]] || { echo "SQLite integrity check failed after restore: ${INTEGRITY}" >&2; exit 1; }

if [[ -z "${IMAGE}" ]]; then
  (
    cd "${REPO_DIR}"
    DATA_DIR="${TARGET_REAL}" pnpm exec tsx src/lib/db/migrate.ts
  )
else
  [[ "${IMAGE}" == *@sha256:* ]] || { echo "Restore drill image must use an immutable digest." >&2; exit 1; }
  [[ "${EXPECTED_COMMIT}" =~ ^[0-9a-f]{40}$ ]] || { echo "Restore drill requires a full expected commit SHA." >&2; exit 1; }
  [[ "${EXPECTED_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "Restore drill requires an expected OCI digest." >&2; exit 1; }
  [[ "${EXPECTED_SCHEMA}" =~ ^[0-9]+$ ]] || { echo "Restore drill requires an expected schema version." >&2; exit 1; }

  docker pull "${IMAGE}" >/dev/null
  docker run --rm --network none \
    -e DATA_DIR=/data \
    -v "${TARGET_REAL}:/data" \
    "${IMAGE}" pnpm db:migrate >/dev/null

  DRILL_CONTAINER="arthurs-review-restore-drill-${GITHUB_RUN_ID:-$$}-${RANDOM}"
  docker run -d --name "${DRILL_CONTAINER}" --network none \
    -e DATA_DIR=/data \
    -e SITE_URL=https://blog.leesaitool.com \
    -e ADMIN_PASSWORD_HASH='scrypt$16384$8$1$ZHJpbGwtc2FsdC0xMjM0NTY3OA==$9zhZGvqilAcQdYQeN2H3cAQSUTb1xdrJ5nV2NwSLiFmM24H7v5fB1pFLo2tUfKj0vN+oJfG53XJguVjWfvVU3A==' \
    -e SESSION_SECRET=restore-drill-session-secret-0123456789 \
    -e BUILD_SHA="${EXPECTED_COMMIT}" \
    -e IMAGE_DIGEST="${EXPECTED_DIGEST}" \
    -v "${TARGET_REAL}:/data" \
    "${IMAGE}" >/dev/null

  HEALTH_RESPONSE="$(mktemp)"
  VERSION_RESPONSE="$(mktemp)"
  healthy=0
  for _attempt in $(seq 1 60); do
    if docker exec "${DRILL_CONTAINER}" sh -lc 'wget -qO- http://127.0.0.1:3000/healthz' >"${HEALTH_RESPONSE}" 2>/dev/null \
      && grep -q '"ok":true' "${HEALTH_RESPONSE}"; then
      healthy=1
      break
    fi
    sleep 1
  done
  if [[ "${healthy}" != "1" ]]; then
    docker logs --tail=80 "${DRILL_CONTAINER}" >&2
    echo "Restore drill /healthz check failed." >&2
    exit 1
  fi

  docker exec "${DRILL_CONTAINER}" sh -lc 'wget -qO- http://127.0.0.1:3000/version' >"${VERSION_RESPONSE}"
  grep -Fq "\"commit\":\"${EXPECTED_COMMIT}\"" "${VERSION_RESPONSE}"
  grep -Fq "\"digest\":\"${EXPECTED_DIGEST}\"" "${VERSION_RESPONSE}"
  grep -Fq "\"schemaVersion\":${EXPECTED_SCHEMA}" "${VERSION_RESPONSE}"
  rm -f "${HEALTH_RESPONSE}" "${VERSION_RESPONSE}"
  HEALTH_RESPONSE=""
  VERSION_RESPONSE=""
fi

FINAL_INTEGRITY="$(sqlite3 "${TARGET_REAL}/arthurs-review.sqlite3" 'PRAGMA integrity_check;')"
[[ "${FINAL_INTEGRITY}" == "ok" ]] || { echo "SQLite integrity check failed after migration: ${FINAL_INTEGRITY}" >&2; exit 1; }
echo "Restore verified in isolated directory: ${TARGET_REAL}"
