#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-root@72.60.195.46}"
APP_DIR="${APP_DIR:-/opt/arthurs-review}"
CHECK_ONLY="${CHECK_ONLY:-0}"
REMOTE_SCRIPT="/root/arthurs-review-switch-xray-caddy.sh"
REMOTE_LOG="/root/arthurs-review-switch-runner.out"

echo "Uploading remote switch script to ${REMOTE}:${REMOTE_SCRIPT}"
scp scripts/remote-switch-xray-caddy.sh "${REMOTE}:${REMOTE_SCRIPT}"

if [[ "${CHECK_ONLY}" == "1" ]]; then
  echo "Running remote precheck only; Xray and Caddy ownership will not change."
  ssh "${REMOTE}" "chmod 700 ${REMOTE_SCRIPT} && APP_DIR='${APP_DIR}' CHECK_ONLY=1 bash ${REMOTE_SCRIPT}"
  exit 0
fi

echo "Starting switch in the background on the server."
echo "If your current VPN still uses port 443, this SSH connection may drop after the remote script starts."
ssh "${REMOTE}" "chmod 700 ${REMOTE_SCRIPT} && APP_DIR='${APP_DIR}' nohup bash ${REMOTE_SCRIPT} > ${REMOTE_LOG} 2>&1 < /dev/null & echo remote-switch-started; echo runner-log=${REMOTE_LOG}; echo detailed-logs=/root/arthurs-review-switch-logs/"

echo "Started. To inspect later:"
echo "  ssh ${REMOTE} 'tail -n 120 ${REMOTE_LOG}; ls -lt /root/arthurs-review-switch-logs | head'"
