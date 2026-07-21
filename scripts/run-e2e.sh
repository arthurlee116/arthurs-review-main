#!/usr/bin/env bash
set -euo pipefail

data_dir="$(mktemp -d "${TMPDIR:-/tmp}/arthurs-review-e2e.XXXXXX")"
cleanup() {
  rm -rf -- "${data_dir}"
}
trap cleanup EXIT INT TERM

export DATA_DIR="${data_dir}"
playwright test "$@"
