#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE="${1:-/opt/arthurs-review/deploy/haproxy.cfg}"
TARGET="/etc/haproxy/haproxy.cfg"

[[ "$(id -u)" == "0" ]] || { echo "Run as root." >&2; exit 1; }
[[ -f "${SOURCE}" ]] || { echo "Missing HAProxy config: ${SOURCE}" >&2; exit 1; }
command -v haproxy >/dev/null || { echo "HAProxy is not installed." >&2; exit 127; }
haproxy -c -f "${SOURCE}" >/dev/null

if cmp -s "${SOURCE}" "${TARGET}"; then
  systemctl is-active --quiet haproxy.service
  exit 0
fi

BACKUP="$(mktemp /etc/haproxy/haproxy.cfg.before-arthurs-review.XXXXXX)"
cp -a "${TARGET}" "${BACKUP}"
rollback() {
  exit_code=$?
  trap - ERR
  cp -a "${BACKUP}" "${TARGET}"
  if ! haproxy -c -f "${TARGET}" >/dev/null \
    || ! systemctl reload haproxy.service \
    || ! systemctl is-active --quiet haproxy.service \
    || ! curl -fsS --max-time 8 --resolve blog.leesaitool.com:443:127.0.0.1 \
      https://blog.leesaitool.com/healthz | grep -q '"ok":true'; then
    echo "HAProxy rollback failed." >&2
    exit 70
  fi
  rm -f "${BACKUP}"
  exit "${exit_code}"
}
trap rollback ERR

install -m 0644 "${SOURCE}" "${TARGET}"
haproxy -c -f "${TARGET}" >/dev/null
systemctl reload haproxy.service
systemctl is-active --quiet haproxy.service

for _attempt in $(seq 1 30); do
  if curl -fsS --max-time 8 --resolve blog.leesaitool.com:443:127.0.0.1 \
    https://blog.leesaitool.com/healthz | grep -q '"ok":true'; then
    trap - ERR
    rm -f "${BACKUP}"
    exit 0
  fi
  sleep 1
done
echo "HAProxy reloaded, but the public blog health check failed." >&2
false
