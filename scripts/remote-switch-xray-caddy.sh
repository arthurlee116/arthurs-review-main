#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/arthurs-review}"
DEPLOY_DIR="${APP_DIR}/deploy"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
ENV_FILE="${DEPLOY_DIR}/production.env"
DOMAIN="${DOMAIN:-blog.leesaitool.com}"
EXPECTED_IP="${EXPECTED_IP:-187.124.247.64}"
CHECK_ONLY="${CHECK_ONLY:-0}"
LOG_DIR="${LOG_DIR:-/root/arthurs-review-switch-logs}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${LOG_DIR}/switch-${STAMP}.log"
BACKUP_DIR="/root/xray-before-caddy-${STAMP}"
LOCK_FILE="/run/arthurs-review-switch.lock"
SWITCH_STARTED=0

mkdir -p "${LOG_DIR}"
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "== Arthur's Review Xray -> Caddy switch =="
echo "time=${STAMP}"
echo "log=${LOG_FILE}"
echo "check_only=${CHECK_ONLY}"

exec 9>"${LOCK_FILE}"
flock -n 9 || {
  echo "Another switch run is already active." >&2
  exit 1
}

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

port_listener() {
  ss -ltnp "sport = :$1" 2>/dev/null || true
}

wait_for_app() {
  echo "Checking app health inside the app container..."
  for _ in $(seq 1 60); do
    if compose exec -T app sh -lc 'wget -qO- http://127.0.0.1:3000/healthz' | grep -q '"ok":true'; then
      echo "App health OK."
      return 0
    fi
    sleep 2
  done
  compose logs --tail=120 app || true
  fail "App did not become healthy."
}

wait_for_https() {
  echo "Checking HTTPS health through Caddy..."
  for _ in $(seq 1 90); do
    if curl -fsS --max-time 8 --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/healthz" | grep -q '"ok":true'; then
      echo "HTTPS health OK."
      return 0
    fi
    sleep 2
  done
  compose logs --tail=160 caddy || true
  fail "Caddy did not serve healthy HTTPS for ${DOMAIN}."
}

rollback() {
  local line="${1:-unknown}"
  echo "Switch failed near line ${line}; rolling back to Xray on 443."
  set +e
  if [[ -f "${COMPOSE_FILE}" ]]; then
    compose stop caddy
  fi
  systemctl enable --now xray.service
  sleep 2
  systemctl is-active --quiet xray.service && echo "Rollback: xray.service is active." || echo "Rollback warning: xray.service is not active."
  port_listener 443
  echo "Rollback complete. Log: ${LOG_FILE}"
}

trap 'rollback "$LINENO"' ERR

[[ "$(id -u)" == "0" ]] || fail "Run as root."
[[ -f "${COMPOSE_FILE}" ]] || fail "Missing ${COMPOSE_FILE}."
[[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}."
command -v docker >/dev/null || fail "Docker is not installed."
docker compose version >/dev/null || fail "Docker Compose plugin is not installed."
command -v curl >/dev/null || fail "curl is missing."
command -v python3 >/dev/null || fail "python3 is missing."

if compose ps caddy 2>/dev/null | grep -q "Up"; then
  echo "Caddy already appears to be running. Verifying HTTPS and exiting if healthy."
  wait_for_https
  echo "Already switched successfully."
  trap - ERR
  exit 0
fi

echo "Checking DNS..."
if ! getent ahostsv4 "${DOMAIN}" | awk '{print $1}' | grep -qx "${EXPECTED_IP}"; then
  getent ahostsv4 "${DOMAIN}" || true
  fail "${DOMAIN} does not resolve to ${EXPECTED_IP} from this server yet."
fi

echo "Checking Xray 2443 fallback service..."
systemctl is-active --quiet xray-test.service || fail "xray-test.service is not active."
port_listener 2443 | grep -q ':2443' || fail "Port 2443 is not listening."

python3 - <<'PY'
import copy
import json
from pathlib import Path

main_path = Path("/usr/local/etc/xray/config.json")
test_path = Path("/usr/local/etc/xray/config-test-2443.json")
main = json.loads(main_path.read_text())
test = json.loads(test_path.read_text())
main_as_2443 = copy.deepcopy(main)
for inbound in main_as_2443.get("inbounds", []):
    if inbound.get("port") == 443:
        inbound["port"] = 2443
if main_as_2443 != test:
    raise SystemExit("xray-test config is not identical to main config except port 443 -> 2443")
print("Xray 2443 config matches main config except port.")
PY

echo "Backing up Xray config and service files..."
mkdir -p "${BACKUP_DIR}"
cp -a /usr/local/etc/xray/config.json "${BACKUP_DIR}/config.json"
cp -a /usr/local/etc/xray/config-test-2443.json "${BACKUP_DIR}/config-test-2443.json"
cp -a /etc/systemd/system/xray.service "${BACKUP_DIR}/xray.service"
cp -a /etc/systemd/system/xray-test.service "${BACKUP_DIR}/xray-test.service"
echo "backup=${BACKUP_DIR}"

echo "Opening firewall ports if UFW is active..."
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 2443/tcp
fi

echo "Validating compose and Caddyfile..."
compose config >/dev/null
docker run --rm -v "${DEPLOY_DIR}/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile

echo "Starting/verifying app container before touching Xray 443..."
compose up -d app
wait_for_app

if [[ "${CHECK_ONLY}" == "1" ]]; then
  trap - ERR
  echo "PRECHECK SUCCESS. No Xray or Caddy ownership changes were made."
  exit 0
fi

echo "Current 443 listener:"
port_listener 443

echo "Stopping xray.service on 443. xray-test.service on 2443 remains active."
SWITCH_STARTED=1
systemctl stop xray.service
systemctl disable xray.service

for _ in $(seq 1 30); do
  if ! port_listener 443 | grep -q ':443'; then
    echo "Port 443 is free."
    break
  fi
  sleep 1
done

if port_listener 443 | grep -q ':443'; then
  fail "Port 443 is still occupied after stopping xray.service."
fi

echo "Starting Caddy..."
compose up -d caddy
sleep 2
compose ps
wait_for_https

echo "Final service state:"
systemctl is-active xray.service || true
systemctl is-active xray-test.service || true
compose ps
port_listener 443
port_listener 2443

trap - ERR
echo "SWITCH SUCCESS. Xray fallback stays on 2443; Caddy owns 80/443."
echo "Log: ${LOG_FILE}"
