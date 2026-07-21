#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-root@72.60.195.46}"
APP_DIR="${APP_DIR:-/opt/arthurs-review}"
printf -v app_dir_quoted '%q' "${APP_DIR}"

echo "The old switch command is now a read-only topology check."
ssh "${REMOTE}" "APP_DIR=${app_dir_quoted} bash -s -- status" < scripts/production-topology-preflight.sh
