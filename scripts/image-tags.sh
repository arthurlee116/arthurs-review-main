#!/usr/bin/env bash
# Print content-hash tags for the images that change rarely, so CI and
# scripts/verify-local.sh can reuse them instead of rebuilding:
#   BASE_TAG      docker/base.Dockerfile
#   SEMANTIC_TAG  semantic.Dockerfile + the files it copies
# Usage: eval "$(scripts/image-tags.sh)"
set -euo pipefail
cd "$(dirname "$0")/.."

digest() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -c1-16; else shasum -a 256 | cut -c1-16; fi
}

hash_files() {
  local file
  for file in "$@"; do
    printf '%s\0' "${file}"
    cat "${file}"
  done | digest
}

semantic_files=(semantic.Dockerfile semantic/pyproject.toml semantic/models.lock.json semantic/download_models.py)
while IFS= read -r file; do semantic_files+=("${file}"); done < <(
  find semantic/semantic_service -type f -name '*.py' -not -path '*/__pycache__/*' | LC_ALL=C sort
)

printf 'BASE_TAG=%s\n' "$(hash_files docker/base.Dockerfile)"
printf 'SEMANTIC_TAG=%s\n' "$(hash_files "${semantic_files[@]}")"
