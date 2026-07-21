#!/usr/bin/env bash
set -euo pipefail

app_pid=""
worker_pid=""

cleanup() {
  trap - EXIT INT TERM
  [[ -z "${worker_pid}" ]] || kill "${worker_pid}" 2>/dev/null || true
  [[ -z "${app_pid}" ]] || kill "${app_pid}" 2>/dev/null || true
  [[ -z "${worker_pid}" ]] || wait "${worker_pid}" 2>/dev/null || true
  [[ -z "${app_pid}" ]] || wait "${app_pid}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pnpm seed
pnpm exec next dev --hostname 127.0.0.1 --port 3100 &
app_pid=$!

for _ in {1..120}; do
  if curl -fs http://127.0.0.1:3100/healthz >/dev/null; then
    pnpm jobs:work &
    worker_pid=$!
    wait "${app_pid}"
    exit $?
  fi
  kill -0 "${app_pid}" 2>/dev/null || wait "${app_pid}"
  sleep 0.25
done

echo "E2E app did not become healthy." >&2
exit 1
