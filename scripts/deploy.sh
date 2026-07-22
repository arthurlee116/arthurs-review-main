#!/usr/bin/env bash
set -Eeuo pipefail

REMOTE="${REMOTE:-root@72.60.195.46}"
APP_DIR="${APP_DIR:-/opt/arthurs-review}"
APP_IMAGE="${APP_IMAGE:-}"
SEMANTIC_IMAGE="${SEMANTIC_IMAGE:-}"
DEPLOY_COMMIT_SHA="${DEPLOY_COMMIT_SHA:-}"
IMAGE_DIGEST="${IMAGE_DIGEST:-}"
SEMANTIC_IMAGE_DIGEST="${SEMANTIC_IMAGE_DIGEST:-}"
EXPECTED_SCHEMA_VERSION="${EXPECTED_SCHEMA_VERSION:-}"
REGISTRY_USERNAME="${REGISTRY_USERNAME:-}"
REGISTRY_TOKEN="${REGISTRY_TOKEN:-}"
ROLLBACK_ONLY="${ROLLBACK_ONLY:-0}"
XRAY_PUBLIC_HOST="${XRAY_PUBLIC_HOST:-72.60.195.46}"
MAINTENANCE_LOCK_FILE="${MAINTENANCE_LOCK_FILE:-/var/lock/arthurs-review-maintenance.lock}"
MAINTENANCE_LOCK_WAIT_SECONDS="${MAINTENANCE_LOCK_WAIT_SECONDS:-1800}"
STAGING_DIR=""
VERIFY_XRAY_ON_EXIT=0

fail() {
  echo "Deploy failed: $*" >&2
  return 1
}

validate_deploy_inputs() {
  [[ "${ROLLBACK_ONLY}" == "0" || "${ROLLBACK_ONLY}" == "1" ]] \
    || { fail "ROLLBACK_ONLY must be 0 or 1"; return; }
  [[ "${REMOTE}" == *@* ]] || { fail "REMOTE must include an explicit user"; return; }
  [[ "${APP_DIR}" == /* && "${APP_DIR}" != "/" ]] || { fail "APP_DIR must be a specific absolute path"; return; }
  [[ "${MAINTENANCE_LOCK_WAIT_SECONDS}" =~ ^[0-9]+$ ]] \
    || { fail "MAINTENANCE_LOCK_WAIT_SECONDS must be an integer"; return; }
  [[ -n "${REGISTRY_USERNAME}" ]] || { fail "REGISTRY_USERNAME is required"; return; }
  [[ -n "${REGISTRY_TOKEN}" ]] || { fail "REGISTRY_TOKEN is required"; return; }
  if [[ "${ROLLBACK_ONLY}" == "0" ]]; then
    [[ -f deploy/production.env ]] || { fail "Missing deploy/production.env"; return; }
    [[ "${APP_IMAGE}" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] \
      || { fail "APP_IMAGE must be an immutable GHCR digest reference"; return; }
    [[ "${SEMANTIC_IMAGE}" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] \
      || { fail "SEMANTIC_IMAGE must be an immutable GHCR digest reference"; return; }
    [[ "${DEPLOY_COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]] || { fail "DEPLOY_COMMIT_SHA must be a full commit SHA"; return; }
    [[ "${IMAGE_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]] || { fail "IMAGE_DIGEST must be a sha256 digest"; return; }
    [[ "${APP_IMAGE##*@}" == "${IMAGE_DIGEST}" ]] || { fail "APP_IMAGE and IMAGE_DIGEST disagree"; return; }
    [[ "${SEMANTIC_IMAGE_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]] \
      || { fail "SEMANTIC_IMAGE_DIGEST must be a sha256 digest"; return; }
    [[ "${SEMANTIC_IMAGE##*@}" == "${SEMANTIC_IMAGE_DIGEST}" ]] \
      || { fail "SEMANTIC_IMAGE and SEMANTIC_IMAGE_DIGEST disagree"; return; }
    [[ "${EXPECTED_SCHEMA_VERSION}" =~ ^[1-9][0-9]*$ ]] || { fail "EXPECTED_SCHEMA_VERSION must be positive"; return; }
  fi
}

probe_external_xray() {
  node -e '
    const net = require("node:net");
    const [host, rawPort] = process.argv.slice(1);
    const socket = net.createConnection({ host, port: Number(rawPort) });
    const timer = setTimeout(() => socket.destroy(new Error("connection timed out")), 10_000);
    socket.once("connect", () => { clearTimeout(timer); socket.destroy(); });
    socket.once("close", (hadError) => { process.exitCode = hadError ? 1 : 0; });
    socket.once("error", (error) => console.error(`Xray TCP probe failed: ${error.message}`));
  ' "${XRAY_PUBLIC_HOST}" 2443
}

cleanup() {
  local exit_code=$? cleanup_status=0 xray_status=0 staging_quoted
  trap - EXIT
  if [[ -n "${STAGING_DIR}" && "${STAGING_DIR}" == "${APP_DIR}"/.release-stage.* ]]; then
    printf -v staging_quoted '%q' "${STAGING_DIR}"
    ssh "${REMOTE}" "rm -rf -- ${staging_quoted}" || cleanup_status=$?
  fi
  if [[ "${VERIFY_XRAY_ON_EXIT}" == "1" ]]; then
    probe_external_xray || xray_status=$?
  fi
  if [[ "${xray_status}" != "0" ]]; then
    echo "Xray on public port 2443 became unreachable; no repair was attempted." >&2
    exit_code="${xray_status}"
  elif [[ "${exit_code}" == "0" && "${cleanup_status}" != "0" ]]; then
    exit_code="${cleanup_status}"
  fi
  exit "${exit_code}"
}

stage_release_files() {
  local app_dir_quoted
  printf -v app_dir_quoted '%q' "${APP_DIR}"
  STAGING_DIR="$(ssh "${REMOTE}" "install -d -m 0755 ${app_dir_quoted}; mktemp -d ${app_dir_quoted}/.release-stage.XXXXXX")" || return
  [[ "${STAGING_DIR}" == "${APP_DIR}"/.release-stage.* ]] \
    || { fail "Remote staging directory was not created under APP_DIR"; return; }
  rsync -az --delete deploy/ "${REMOTE}:${STAGING_DIR}/deploy/" || return
  rsync -az --delete scripts/ "${REMOTE}:${STAGING_DIR}/scripts/" || return
}

run_remote_release() {
  local mode="$1"
  local app_dir_quoted staging_quoted image_quoted semantic_image_quoted commit_quoted digest_quoted semantic_digest_quoted schema_quoted
  local username_quoted lock_quoted wait_quoted script_quoted
  printf -v app_dir_quoted '%q' "${APP_DIR}"
  printf -v staging_quoted '%q' "${STAGING_DIR}"
  printf -v image_quoted '%q' "${APP_IMAGE}"
  printf -v semantic_image_quoted '%q' "${SEMANTIC_IMAGE}"
  printf -v commit_quoted '%q' "${DEPLOY_COMMIT_SHA}"
  printf -v digest_quoted '%q' "${IMAGE_DIGEST}"
  printf -v semantic_digest_quoted '%q' "${SEMANTIC_IMAGE_DIGEST}"
  printf -v schema_quoted '%q' "${EXPECTED_SCHEMA_VERSION}"
  printf -v username_quoted '%q' "${REGISTRY_USERNAME}"
  printf -v lock_quoted '%q' "${MAINTENANCE_LOCK_FILE}"
  printf -v wait_quoted '%q' "${MAINTENANCE_LOCK_WAIT_SECONDS}"
  printf -v script_quoted '%q' "${STAGING_DIR}/scripts/remote-release.sh"

  printf '%s' "${REGISTRY_TOKEN}" | ssh "${REMOTE}" \
    "APP_DIR=${app_dir_quoted} STAGING_DIR=${staging_quoted} APP_IMAGE=${image_quoted} SEMANTIC_IMAGE=${semantic_image_quoted} DEPLOY_COMMIT_SHA=${commit_quoted} IMAGE_DIGEST=${digest_quoted} SEMANTIC_IMAGE_DIGEST=${semantic_digest_quoted} EXPECTED_SCHEMA_VERSION=${schema_quoted} REGISTRY_USERNAME=${username_quoted} MAINTENANCE_LOCK_FILE=${lock_quoted} MAINTENANCE_LOCK_WAIT_SECONDS=${wait_quoted} ${script_quoted} ${mode}"
}

main() {
  local mode="forward"
  validate_deploy_inputs || return
  trap cleanup EXIT
  ssh "${REMOTE}" "command -v flock >/dev/null" || { fail "The VPS is missing flock"; return; }
  probe_external_xray || { fail "Xray public port 2443 is unreachable before deployment"; return; }
  VERIFY_XRAY_ON_EXIT=1
  stage_release_files || return
  if [[ "${ROLLBACK_ONLY}" == "1" ]]; then mode="rollback"; fi
  run_remote_release "${mode}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
