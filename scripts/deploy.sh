#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-root@72.60.195.46}"
APP_DIR="${APP_DIR:-/opt/arthurs-review}"
APP_ONLY="${APP_ONLY:-0}"
XRAY_PUBLIC_HOST="${XRAY_PUBLIC_HOST:-72.60.195.46}"
MAINTENANCE_LOCK_FILE="${MAINTENANCE_LOCK_FILE:-/var/lock/arthurs-review-maintenance.lock}"
MAINTENANCE_LOCK_WAIT_SECONDS="${MAINTENANCE_LOCK_WAIT_SECONDS:-1800}"
REMOTE_LOCK_PID=""
REMOTE_LOCK_CONTROL_DIR=""
REMOTE_LOCK_FD_OPEN=0
PUBLIC_HEADER_FILE=""
XRAY_FINGERPRINT=""
XRAY_GUARD_VERIFIED=0

probe_external_xray() {
  node -e '
    const net = require("node:net");
    const [host, rawPort] = process.argv.slice(1);
    const socket = net.createConnection({ host, port: Number(rawPort) });
    const timer = setTimeout(() => socket.destroy(new Error("connection timed out")), 10_000);
    socket.once("connect", () => { clearTimeout(timer); socket.destroy(); });
    socket.once("close", (hadError) => process.exitCode = hadError ? 1 : 0);
    socket.once("error", (error) => console.error(`Xray TCP probe failed: ${error.message}`));
  ' "${XRAY_PUBLIC_HOST}" 2443
}

verify_xray_unchanged() {
  local expect_topology="${1:-0}"
  local topology_arg=""
  printf -v app_dir_quoted '%q' "${APP_DIR}"
  printf -v preflight_quoted '%q' "${APP_DIR}/scripts/production-topology-preflight.sh"
  printf -v fingerprint_quoted '%q' "${XRAY_FINGERPRINT}"
  if [[ "${expect_topology}" == "1" ]]; then topology_arg=" --expect-topology"; fi
  ssh "${REMOTE}" "APP_DIR=${app_dir_quoted} ${preflight_quoted} verify ${fingerprint_quoted}${topology_arg}"
  probe_external_xray
}

cleanup() {
  exit_code=$?
  trap - EXIT
  if [[ -n "${XRAY_FINGERPRINT}" && "${XRAY_GUARD_VERIFIED}" != "1" ]]; then
    xray_exit=0
    verify_xray_unchanged 0 || xray_exit=$?
    if [[ "${xray_exit}" != "0" ]]; then
      echo "Xray changed or became unreachable; no repair was attempted." >&2
      exit_code="${xray_exit}"
    fi
  fi
  if [[ -n "${PUBLIC_HEADER_FILE}" ]]; then
    rm -f "${PUBLIC_HEADER_FILE}"
  fi
  if [[ "${REMOTE_LOCK_FD_OPEN}" == "1" ]]; then
    exec 9>&-
    REMOTE_LOCK_FD_OPEN=0
  fi
  if [[ -n "${REMOTE_LOCK_PID}" ]]; then
    lock_exit=0
    wait "${REMOTE_LOCK_PID}" || lock_exit=$?
    if [[ "${exit_code}" == "0" && "${lock_exit}" != "0" ]]; then
      exit_code="${lock_exit}"
    fi
  fi
  if [[ -n "${REMOTE_LOCK_CONTROL_DIR}" ]]; then
    rm -rf "${REMOTE_LOCK_CONTROL_DIR}"
  fi
  exit "${exit_code}"
}
trap cleanup EXIT

acquire_remote_maintenance_lock() {
  [[ "${MAINTENANCE_LOCK_WAIT_SECONDS}" =~ ^[0-9]+$ ]] || {
    echo "MAINTENANCE_LOCK_WAIT_SECONDS must be an integer." >&2
    return 1
  }
  printf -v lock_file_quoted '%q' "${MAINTENANCE_LOCK_FILE}"
  printf -v lock_wait_quoted '%q' "${MAINTENANCE_LOCK_WAIT_SECONDS}"
  REMOTE_LOCK_CONTROL_DIR="$(mktemp -d)"
  lock_input="${REMOTE_LOCK_CONTROL_DIR}/input"
  lock_output="${REMOTE_LOCK_CONTROL_DIR}/output"
  mkfifo "${lock_input}"
  : >"${lock_output}"
  exec 9<>"${lock_input}"
  REMOTE_LOCK_FD_OPEN=1
  (
    exec 9>&-
    ssh "${REMOTE}" "set -eu; command -v flock >/dev/null || { echo 'Missing required command: flock' >&2; exit 127; }; exec flock --exclusive --wait ${lock_wait_quoted} ${lock_file_quoted} sh -c 'printf \"LOCKED\\n\"; cat >/dev/null'"
  ) <"${lock_input}" >"${lock_output}" &
  REMOTE_LOCK_PID=$!

  deadline=$((SECONDS + MAINTENANCE_LOCK_WAIT_SECONDS + 30))
  while (( SECONDS < deadline )); do
    if grep -qx LOCKED "${lock_output}"; then
      return 0
    fi
    if ! kill -0 "${REMOTE_LOCK_PID}" 2>/dev/null; then
      wait "${REMOTE_LOCK_PID}" || true
      REMOTE_LOCK_PID=""
      echo "Could not acquire the production maintenance lock." >&2
      return 1
    fi
    sleep 1
  done
  kill "${REMOTE_LOCK_PID}" 2>/dev/null || true
  wait "${REMOTE_LOCK_PID}" 2>/dev/null || true
  REMOTE_LOCK_PID=""
  echo "Timed out waiting for the production maintenance lock." >&2
  return 1
}

if [[ ! -f deploy/production.env ]]; then
  echo "Missing deploy/production.env. Create it from deploy/production.env.example before deploying." >&2
  exit 1
fi

acquire_remote_maintenance_lock
probe_external_xray

ssh "${REMOTE}" '
set -eu
if command -v sqlite3 >/dev/null 2>&1; then
  exit 0
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y sqlite3 >/dev/null
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache sqlite >/dev/null
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y sqlite >/dev/null
elif command -v yum >/dev/null 2>&1; then
  yum install -y sqlite >/dev/null
else
  echo "No supported package manager is available to install sqlite3." >&2
  exit 127
fi
command -v sqlite3 >/dev/null
'

rsync -az --delete \
  --exclude .git \
  --exclude .codegraph \
  --exclude node_modules \
  --exclude .next \
  --exclude .ops-secrets \
  --exclude .playwright-mcp \
  --exclude data \
  --exclude test-results \
  --exclude playwright-report \
  --exclude '/*.png' \
  ./ "${REMOTE}:${APP_DIR}/"

printf -v app_dir_quoted '%q' "${APP_DIR}"
printf -v preflight_quoted '%q' "${APP_DIR}/scripts/production-topology-preflight.sh"
XRAY_FINGERPRINT="$(ssh "${REMOTE}" "APP_DIR=${app_dir_quoted} ${preflight_quoted} fingerprint")"
[[ "${XRAY_FINGERPRINT}" =~ ^[0-9a-f]{64}$ ]] || {
  echo "Production preflight did not return a valid Xray fingerprint." >&2
  exit 1
}

ssh "${REMOTE}" "cd ${app_dir_quoted}/deploy && docker compose pull caddy >/dev/null && docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile"

if [[ "${APP_ONLY}" == "1" ]]; then
  ssh "${REMOTE}" "cd ${app_dir_quoted}/deploy && docker compose build app && docker compose up -d app worker"
else
  ssh "${REMOTE}" "cd ${app_dir_quoted}/deploy && docker compose up -d --build"
fi
ssh "${REMOTE}" "cd ${app_dir_quoted}/deploy && docker compose up -d caddy && docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile"
ssh "${REMOTE}" "cd ${app_dir_quoted}/deploy && for i in \$(seq 1 60); do docker compose exec -T app sh -lc 'wget -qO- http://127.0.0.1:3000/healthz' | grep -q '\"ok\":true' && exit 0; sleep 2; done; docker compose logs --tail=80 app; exit 1"
ssh "${REMOTE}" "${app_dir_quoted}/scripts/install-haproxy-config.sh ${app_dir_quoted}/deploy/haproxy.cfg"

PUBLIC_URL="${PUBLIC_URL:-https://blog.leesaitool.com}"
PUBLIC_HEADER_FILE="$(mktemp)"
PUBLIC_HEADERS_OK=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 15 -D "${PUBLIC_HEADER_FILE}" -o /dev/null "${PUBLIC_URL}/healthz" \
    && grep -qi '^strict-transport-security:' "${PUBLIC_HEADER_FILE}" \
    && grep -qi '^x-content-type-options:' "${PUBLIC_HEADER_FILE}" \
    && grep -qi '^referrer-policy:' "${PUBLIC_HEADER_FILE}" \
    && grep -qi '^content-security-policy:.*frame-ancestors' "${PUBLIC_HEADER_FILE}" \
    && grep -qi '^permissions-policy:.*camera=()' "${PUBLIC_HEADER_FILE}" \
    && ! grep -qi '^x-powered-by:' "${PUBLIC_HEADER_FILE}"; then
    PUBLIC_HEADERS_OK=1
    break
  fi
  sleep 2
done
if [[ "${PUBLIC_HEADERS_OK}" != "1" ]]; then
  echo "Public security-header probe failed for ${PUBLIC_URL}." >&2
  cat "${PUBLIC_HEADER_FILE}" >&2
  exit 1
fi
rm -f "${PUBLIC_HEADER_FILE}"
PUBLIC_HEADER_FILE=""

verify_xray_unchanged 1
XRAY_GUARD_VERIFIED=1

ssh "${REMOTE}" "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
