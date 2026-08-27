#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/arthurs-review}"
COMPOSE_FILE="${APP_DIR}/deploy/docker-compose.yml"
XRAY_9443_UNIT="${XRAY_9443_UNIT:-xray-443.service}"
XRAY_9443_CONFIG="${XRAY_9443_CONFIG:-/usr/local/etc/xray/config-443.json}"

fail() {
  echo "Topology preflight failed: $*" >&2
  exit 1
}

listener() {
  ss -H -ltnp "sport = :$1" 2>/dev/null || true
}

require_xray() {
  local unit="$1" config="$2" port="$3"
  systemctl is-active --quiet "${unit}" || fail "${unit} is not active"
  [[ -f "${config}" ]] || fail "missing ${config}"
  listener "${port}" | grep -q ":${port}" || fail "Xray is not listening on ${port}"
}

validate_xray() {
  require_xray "${XRAY_9443_UNIT}" "${XRAY_9443_CONFIG}" 9443
}

xray_fingerprint() {
  validate_xray
  {
    fragment="$(systemctl show "${XRAY_9443_UNIT}" -p FragmentPath --value)"
    [[ -f "${fragment}" ]] || fail "missing unit file for ${XRAY_9443_UNIT}"
    printf '%s\n' "${XRAY_9443_UNIT}"
    systemctl show "${XRAY_9443_UNIT}" -p FragmentPath -p ExecStart
    sha256sum "${fragment}"
    sha256sum "${XRAY_9443_CONFIG}"
  } | sha256sum | cut -d' ' -f1
}

expect_process_on_port() {
  local process="$1" port="$2"
  listener "${port}" | grep -q "\"${process}\"" || fail "${process} does not own port ${port}"
}

validate_topology() {
  systemctl is-active --quiet haproxy.service || fail "haproxy.service is not active"
  expect_process_on_port haproxy 80
  expect_process_on_port haproxy 443
  expect_process_on_port xray 9443
  listener 8444 | grep -q ':8444' || fail "Caddy is not published on loopback port 8444"
  docker compose -f "${COMPOSE_FILE}" ps --status running --services | grep -qx caddy \
    || fail "Caddy container is not running"
  [[ "$(docker compose -f "${COMPOSE_FILE}" port caddy 443)" == "127.0.0.1:8444" ]] \
    || fail "Caddy 443 must only be published on 127.0.0.1:8444"
  cmp -s /etc/haproxy/haproxy.cfg "${APP_DIR}/deploy/haproxy.cfg" \
    || fail "live HAProxy config differs from the versioned config"
}

mode="${1:-status}"
case "${mode}" in
  fingerprint)
    xray_fingerprint
    ;;
  verify)
    expected="${2:-}"
    [[ "${expected}" =~ ^[0-9a-f]{64}$ ]] || fail "expected fingerprint must be SHA-256"
    actual="$(xray_fingerprint)"
    [[ "${actual}" == "${expected}" ]] || fail "Xray unit or config changed"
    if [[ "${3:-}" == "--expect-topology" ]]; then validate_topology; fi
    ;;
  status)
    validate_xray
    systemctl show "${XRAY_9443_UNIT}" haproxy.service \
      -p Id -p LoadState -p ActiveState -p SubState -p FragmentPath
    for port in 80 443 8444 9443; do listener "${port}"; done
    ;;
  *)
    echo "Usage: production-topology-preflight.sh [status|fingerprint|verify <sha256> [--expect-topology]]" >&2
    exit 2
    ;;
esac
