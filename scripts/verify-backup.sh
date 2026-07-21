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

while IFS= read -r member; do
  case "${member}" in
    arthurs-review.sqlite3|MANIFEST.sha256|markdown|markdown/*|uploads|uploads/*|proofs|proofs/*) ;;
    *) echo "Backup contains an unexpected or unsafe path: ${member}" >&2; exit 1 ;;
  esac
done < <(tar -tzf "${ARCHIVE}")

if tar -tvzf "${ARCHIVE}" | awk 'substr($1, 1, 1) ~ /[lh]/ { found=1 } END { exit(found ? 0 : 1) }'; then
  echo "Backup must not contain hard links or symbolic links." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
tar -xzf "${ARCHIVE}" -C "${WORK_DIR}"

for required in arthurs-review.sqlite3 markdown uploads proofs MANIFEST.sha256; do
  [[ -e "${WORK_DIR}/${required}" ]] || { echo "Backup is missing ${required}" >&2; exit 1; }
done

if find "${WORK_DIR}" \( -type l -o ! -user "$(id -u)" \) -print -quit | grep -q .; then
  echo "Backup contains an unsafe extracted entry." >&2
  exit 1
fi

(
  cd "${WORK_DIR}"
  cut -c 67- MANIFEST.sha256 | LC_ALL=C sort > manifest-files.txt
  find arthurs-review.sqlite3 markdown uploads proofs -type f -print | LC_ALL=C sort > archive-files.txt
  diff -u manifest-files.txt archive-files.txt >/dev/null || {
    echo "Backup manifest does not describe every archived data file exactly once." >&2
    exit 1
  }
  sha256sum --strict -c MANIFEST.sha256
)

INTEGRITY="$(sqlite3 "${WORK_DIR}/arthurs-review.sqlite3" 'PRAGMA integrity_check;')"
[[ "${INTEGRITY}" == "ok" ]] || { echo "SQLite integrity check failed: ${INTEGRITY}" >&2; exit 1; }
echo "Backup verified: ${ARCHIVE}"
