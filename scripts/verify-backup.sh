#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "${ARCHIVE}" || ! -f "${ARCHIVE}" ]]; then
  echo "Usage: verify-backup.sh <backup.tar.gz>" >&2
  exit 1
fi

for command in tar sha256sum sqlite3; do
  command -v "${command}" >/dev/null || { echo "Missing required command: ${command}" >&2; exit 1; }
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
tar -xzf "${ARCHIVE}" -C "${WORK_DIR}"

for required in arthurs-review.sqlite3 markdown uploads proofs MANIFEST.sha256; do
  [[ -e "${WORK_DIR}/${required}" ]] || { echo "Backup is missing ${required}" >&2; exit 1; }
done

(
  cd "${WORK_DIR}"
  sha256sum -c MANIFEST.sha256
)

INTEGRITY="$(sqlite3 "${WORK_DIR}/arthurs-review.sqlite3" 'PRAGMA integrity_check;')"
[[ "${INTEGRITY}" == "ok" ]] || { echo "SQLite integrity check failed: ${INTEGRITY}" >&2; exit 1; }
echo "Backup verified: ${ARCHIVE}"
