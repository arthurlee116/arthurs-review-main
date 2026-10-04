#!/usr/bin/env bash
set -euo pipefail

# Keep this version/path in sync with deploy/docker-compose.yml.
VERSION="2.11.7"
ARCHIVE_SHA256="727b91701a392de6ebc5027509f548bf39979e5216340d0faed8fa5e69c84f8b"
TARGET_DIR="/opt/arthurs-review-runtime/caddy/${VERSION}"

[[ "$(id -u)" == "0" ]] || { echo "Run as root on the VPS." >&2; exit 1; }
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] \
  || { echo "This pinned release is for Linux amd64." >&2; exit 1; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
ARCHIVE="caddy_${VERSION}_linux_amd64.tar.gz"
curl -fSL --retry 3 --connect-timeout 15 --max-time 180 \
  "https://github.com/caddyserver/caddy/releases/download/v${VERSION}/${ARCHIVE}" \
  -o "${WORK_DIR}/${ARCHIVE}"
printf '%s  %s\n' "${ARCHIVE_SHA256}" "${WORK_DIR}/${ARCHIVE}" | sha256sum -c -
tar -xzf "${WORK_DIR}/${ARCHIVE}" -C "${WORK_DIR}" caddy
[[ "$("${WORK_DIR}/caddy" version)" == "v${VERSION} "* ]]

install -d -m 0755 "${TARGET_DIR}"
if [[ -f "${TARGET_DIR}/caddy" ]] && cmp -s "${WORK_DIR}/caddy" "${TARGET_DIR}/caddy"; then
  echo "Caddy ${VERSION} is already installed."
  exit 0
fi
# Never modify a binary already mounted into a running container.
[[ ! -e "${TARGET_DIR}/caddy" ]] \
  || { echo "Existing Caddy binary differs; refusing to overwrite it." >&2; exit 1; }
install -m 0755 "${WORK_DIR}/caddy" "${TARGET_DIR}/caddy"
echo "Installed verified Caddy ${VERSION} at ${TARGET_DIR}/caddy."
