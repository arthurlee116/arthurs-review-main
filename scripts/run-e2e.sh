#!/usr/bin/env bash
set -euo pipefail

data_dir="$(mktemp -d "${TMPDIR:-/tmp}/arthurs-review-e2e.XXXXXX")"
cleanup() {
  rm -rf -- "${data_dir}"
}
trap cleanup EXIT INT TERM

export DATA_DIR="${data_dir}"
export NO_PROXY="127.0.0.1,localhost"
export no_proxy="127.0.0.1,localhost"
export SITE_URL="http://127.0.0.1:3100"
export INTERNAL_APP_URL="http://127.0.0.1:3100"
export WORKER_REVALIDATE_SECRET="e2e-worker-revalidate-secret"
export OTS_CLI_PATH="/bin/false"
export ADMIN_PASSWORD_HASH='scrypt$16384$8$1$YXJ0aHVycy1yZXZpZXctZTJl$B8w4AkTlSV2dCTJRqSbGGTODO+tbdf5CGiHMVKwR0JDtZTLg0Y2OufUAJ+wcBHuagSp1C/tvIpU/cD8/51AdGQ=='
export SESSION_SECRET="0123456789abcdefghijklmnopqrstuvwxyzABCDEF"
export LOGIN_RATE_LIMIT_MAX=100

exec "$(dirname "$0")/../node_modules/.bin/playwright" test "$@"
