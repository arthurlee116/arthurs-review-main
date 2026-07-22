#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/arthurs-review}"
STAGING_DIR="${STAGING_DIR:-}"
STATE_DIR="${STATE_DIR:-/var/lib/arthurs-review}"
DATA_DIR="${PRODUCTION_DATA_DIR:-/var/www/arthurs-review/data}"
DATABASE_PATH="${DATABASE_PATH:-${DATA_DIR}/arthurs-review.sqlite3}"
MAINTENANCE_LOCK_FILE="${MAINTENANCE_LOCK_FILE:-/var/lock/arthurs-review-maintenance.lock}"
MAINTENANCE_LOCK_WAIT_SECONDS="${MAINTENANCE_LOCK_WAIT_SECONDS:-1800}"
PUBLIC_URL="${PUBLIC_URL:-https://blog.leesaitool.com}"
STUDIO_URL="${STUDIO_URL:-https://studio.blog.leesaitool.com}"
APP_IMAGE="${APP_IMAGE:-}"
SEMANTIC_IMAGE="${SEMANTIC_IMAGE:-}"
DEPLOY_COMMIT_SHA="${DEPLOY_COMMIT_SHA:-}"
IMAGE_DIGEST="${IMAGE_DIGEST:-}"
SEMANTIC_IMAGE_DIGEST="${SEMANTIC_IMAGE_DIGEST:-}"
EXPECTED_SCHEMA_VERSION="${EXPECTED_SCHEMA_VERSION:-}"
REGISTRY_USERNAME="${REGISTRY_USERNAME:-}"

COMPOSE_DIR="${APP_DIR}/deploy"
CURRENT_RELEASE_FILE="${STATE_DIR}/current-release.env"
PREVIOUS_RELEASE_FILE="${STATE_DIR}/previous-release.env"

XRAY_FINGERPRINT=""
RELEASE_WORK_DIR=""
CONFIG_SNAPSHOT=""
DATABASE_SNAPSHOT=""
HAPROXY_SNAPSHOT=""
STATE_SNAPSHOT_DIR=""
CURRENT_WAS_IMMUTABLE=0
CURRENT_APP_IMAGE=""
CURRENT_SEMANTIC_IMAGE=""
CURRENT_COMMIT_SHA=""
CURRENT_IMAGE_DIGEST=""
CURRENT_SEMANTIC_IMAGE_DIGEST=""
CURRENT_SCHEMA_VERSION=""
APP_WAS_RUNNING=0
WORKER_WAS_RUNNING=0
TRANSACTION_MUTATED=0

fail() {
  echo "Release failed: $*" >&2
  return 1
}

acquire_maintenance_lock() {
  local mode="$1"
  [[ "${MAINTENANCE_LOCK_HELD:-0}" == "1" ]] && return 0
  command -v flock >/dev/null || { fail "Missing required command: flock"; return; }
  [[ "${MAINTENANCE_LOCK_WAIT_SECONDS}" =~ ^[0-9]+$ ]] \
    || { fail "MAINTENANCE_LOCK_WAIT_SECONDS must be an integer"; return; }
  install -d -m 0700 "${STATE_DIR}" || return
  mkdir -p "$(dirname "${MAINTENANCE_LOCK_FILE}")" || return
  touch "${MAINTENANCE_LOCK_FILE}" || return
  chmod 0600 "${MAINTENANCE_LOCK_FILE}" || return
  exec flock --exclusive --wait "${MAINTENANCE_LOCK_WAIT_SECONDS}" "${MAINTENANCE_LOCK_FILE}" \
    env MAINTENANCE_LOCK_HELD=1 "${BASH_SOURCE[0]}" "${mode}"
}

validate_release_inputs() {
  [[ "${APP_IMAGE}" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] \
    || { fail "APP_IMAGE must be a lowercase GHCR reference pinned with @sha256"; return; }
  [[ "${SEMANTIC_IMAGE}" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] \
    || { fail "SEMANTIC_IMAGE must be a lowercase GHCR reference pinned with @sha256"; return; }
  [[ "${DEPLOY_COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]] \
    || { fail "DEPLOY_COMMIT_SHA must be a full commit SHA"; return; }
  [[ "${IMAGE_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || { fail "IMAGE_DIGEST must be a sha256 digest"; return; }
  [[ "${APP_IMAGE##*@}" == "${IMAGE_DIGEST}" ]] \
    || { fail "APP_IMAGE and IMAGE_DIGEST disagree"; return; }
  [[ "${SEMANTIC_IMAGE_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || { fail "SEMANTIC_IMAGE_DIGEST must be a sha256 digest"; return; }
  [[ "${SEMANTIC_IMAGE##*@}" == "${SEMANTIC_IMAGE_DIGEST}" ]] \
    || { fail "SEMANTIC_IMAGE and SEMANTIC_IMAGE_DIGEST disagree"; return; }
  [[ "${EXPECTED_SCHEMA_VERSION}" =~ ^[1-9][0-9]*$ ]] \
    || { fail "EXPECTED_SCHEMA_VERSION must be a positive integer"; return; }
  [[ -n "${REGISTRY_USERNAME}" ]] || { fail "REGISTRY_USERNAME is required"; return; }
}

validate_forward_context() {
  validate_release_inputs || return
  [[ "$(id -u)" == "0" ]] || { fail "Remote releases must run as root"; return; }
  [[ "${APP_DIR}" == /* && "${APP_DIR}" != "/" ]] || { fail "APP_DIR must be a specific absolute path"; return; }
  [[ "${STAGING_DIR}" == "${APP_DIR}"/.release-stage.* ]] \
    || { fail "STAGING_DIR is outside the release staging area"; return; }
  [[ -d "${STAGING_DIR}/deploy" && -d "${STAGING_DIR}/scripts" ]] \
    || { fail "The staged deploy files are incomplete"; return; }
  [[ -f "${STAGING_DIR}/deploy/production.env" ]] || { fail "The staged production.env is missing"; return; }
}

install_server_dependencies() {
  if command -v sqlite3 >/dev/null 2>&1; then
    :
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y sqlite3 >/dev/null || return
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache sqlite >/dev/null || return
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y sqlite >/dev/null || return
  elif command -v yum >/dev/null 2>&1; then
    yum install -y sqlite >/dev/null || return
  else
    fail "No supported package manager is available to install sqlite3"
    return
  fi
  for command_name in curl docker flock haproxy rsync sha256sum sqlite3 tar; do
    command -v "${command_name}" >/dev/null || { fail "Missing required command: ${command_name}"; return; }
  done
}

production_compose() {
  (cd "${COMPOSE_DIR}" && docker compose "$@")
}

staging_compose() {
  (cd "${STAGING_DIR}/deploy" && docker compose "$@")
}

production_app_logs() {
  (cd "${COMPOSE_DIR}" && docker compose logs --tail=80 app)
}

write_compose_env() {
  local directory="$1" image="$2" commit="$3" digest="$4" semantic_image="${5:-}"
  local temporary
  temporary="$(mktemp "${directory}/.env.XXXXXX")" || return
  chmod 0600 "${temporary}" || return
  {
    printf 'APP_IMAGE=%s\n' "${image}"
    printf 'DEPLOY_COMMIT_SHA=%s\n' "${commit}"
    printf 'IMAGE_DIGEST=%s\n' "${digest}"
    if [[ -n "${semantic_image}" ]]; then printf 'SEMANTIC_IMAGE=%s\n' "${semantic_image}"; fi
  } >"${temporary}" || return
  mv -f "${temporary}" "${directory}/.env"
}

verify_image_revision() {
  local image="$1" commit="$2" revision
  revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${image}")" || return
  [[ "${revision}" == "${commit}" ]] || fail "Image revision label does not match ${commit}"
}

pull_target_image() {
  local pull_status=0 logout_status=0
  docker login ghcr.io --username "${REGISTRY_USERNAME}" --password-stdin >/dev/null || return
  docker pull "${APP_IMAGE}" >/dev/null || pull_status=$?
  if [[ "${pull_status}" == "0" ]]; then
    docker pull "${SEMANTIC_IMAGE}" >/dev/null || pull_status=$?
  fi
  docker logout ghcr.io >/dev/null || logout_status=$?
  [[ "${pull_status}" == "0" ]] || return "${pull_status}"
  [[ "${logout_status}" == "0" ]] || return "${logout_status}"
  verify_image_revision "${APP_IMAGE}" "${DEPLOY_COMMIT_SHA}" || return
  verify_image_revision "${SEMANTIC_IMAGE}" "${DEPLOY_COMMIT_SHA}"
}

pull_recorded_image() {
  local image="$1" commit="$2" semantic_image="${3:-}" pull_status=0 logout_status=0
  docker login ghcr.io --username "${REGISTRY_USERNAME}" --password-stdin >/dev/null || return
  docker pull "${image}" >/dev/null || pull_status=$?
  if [[ "${pull_status}" == "0" && -n "${semantic_image}" ]]; then
    docker pull "${semantic_image}" >/dev/null || pull_status=$?
  fi
  docker logout ghcr.io >/dev/null || logout_status=$?
  [[ "${pull_status}" == "0" ]] || return "${pull_status}"
  [[ "${logout_status}" == "0" ]] || return "${logout_status}"
  verify_image_revision "${image}" "${commit}" || return
  if [[ -n "${semantic_image}" ]]; then verify_image_revision "${semantic_image}" "${commit}"; fi
}

load_release_file() {
  local release_file="$1"
  unset RELEASE_APP_IMAGE RELEASE_SEMANTIC_IMAGE RELEASE_COMMIT_SHA RELEASE_IMAGE_DIGEST RELEASE_SEMANTIC_IMAGE_DIGEST RELEASE_SCHEMA_VERSION
  unset RELEASE_CONFIG_SNAPSHOT RELEASE_DATABASE_SNAPSHOT RELEASE_HAPROXY_SNAPSHOT
  # The file is generated below, root-owned, mode 0600, and contains only shell-escaped scalar assignments.
  # shellcheck disable=SC1090
  source "${release_file}" || return
  [[ "${RELEASE_APP_IMAGE:-}" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] \
    || { fail "Invalid image in ${release_file}"; return; }
  [[ "${RELEASE_COMMIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { fail "Invalid commit in ${release_file}"; return; }
  [[ "${RELEASE_IMAGE_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]] || { fail "Invalid digest in ${release_file}"; return; }
  [[ "${RELEASE_APP_IMAGE##*@}" == "${RELEASE_IMAGE_DIGEST}" ]] \
    || { fail "Release image and digest disagree in ${release_file}"; return; }
  if [[ -n "${RELEASE_SEMANTIC_IMAGE:-}" || -n "${RELEASE_SEMANTIC_IMAGE_DIGEST:-}" ]]; then
    [[ "${RELEASE_SEMANTIC_IMAGE:-}" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] \
      || { fail "Invalid semantic image in ${release_file}"; return; }
    [[ "${RELEASE_SEMANTIC_IMAGE_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]] \
      || { fail "Invalid semantic digest in ${release_file}"; return; }
    [[ "${RELEASE_SEMANTIC_IMAGE##*@}" == "${RELEASE_SEMANTIC_IMAGE_DIGEST}" ]] \
      || { fail "Release semantic image and digest disagree in ${release_file}"; return; }
  fi
  [[ "${RELEASE_SCHEMA_VERSION:-}" =~ ^[1-9][0-9]*$ ]] || { fail "Invalid schema in ${release_file}"; return; }
}

load_current_release() {
  CURRENT_WAS_IMMUTABLE=0
  CURRENT_APP_IMAGE=""
  CURRENT_SEMANTIC_IMAGE=""
  CURRENT_COMMIT_SHA=""
  CURRENT_IMAGE_DIGEST=""
  CURRENT_SEMANTIC_IMAGE_DIGEST=""
  CURRENT_SCHEMA_VERSION=""
  if [[ -f "${CURRENT_RELEASE_FILE}" ]]; then
    load_release_file "${CURRENT_RELEASE_FILE}" || return
    CURRENT_WAS_IMMUTABLE=1
    CURRENT_APP_IMAGE="${RELEASE_APP_IMAGE}"
    CURRENT_SEMANTIC_IMAGE="${RELEASE_SEMANTIC_IMAGE:-}"
    CURRENT_COMMIT_SHA="${RELEASE_COMMIT_SHA}"
    CURRENT_IMAGE_DIGEST="${RELEASE_IMAGE_DIGEST}"
    CURRENT_SEMANTIC_IMAGE_DIGEST="${RELEASE_SEMANTIC_IMAGE_DIGEST:-}"
    CURRENT_SCHEMA_VERSION="${RELEASE_SCHEMA_VERSION}"
  fi
}

write_release_file() {
  local destination="$1" image="$2" commit="$3" digest="$4" schema="$5"
  local semantic_image="${6:-}" semantic_digest="${7:-}"
  local config_snapshot="${8:-}" database_snapshot="${9:-}" haproxy_snapshot="${10:-}"
  local temporary
  temporary="$(mktemp "${STATE_DIR}/.release-state.XXXXXX")" || return
  chmod 0600 "${temporary}" || return
  {
    printf 'RELEASE_APP_IMAGE=%q\n' "${image}"
    printf 'RELEASE_COMMIT_SHA=%q\n' "${commit}"
    printf 'RELEASE_IMAGE_DIGEST=%q\n' "${digest}"
    printf 'RELEASE_SEMANTIC_IMAGE=%q\n' "${semantic_image}"
    printf 'RELEASE_SEMANTIC_IMAGE_DIGEST=%q\n' "${semantic_digest}"
    printf 'RELEASE_SCHEMA_VERSION=%q\n' "${schema}"
    printf 'RELEASE_CONFIG_SNAPSHOT=%q\n' "${config_snapshot}"
    printf 'RELEASE_DATABASE_SNAPSHOT=%q\n' "${database_snapshot}"
    printf 'RELEASE_HAPROXY_SNAPSHOT=%q\n' "${haproxy_snapshot}"
  } >"${temporary}" || return
  mv -f "${temporary}" "${destination}"
}

snapshot_release_state_files() {
  STATE_SNAPSHOT_DIR="${RELEASE_WORK_DIR}/release-state-before"
  install -d -m 0700 "${STATE_SNAPSHOT_DIR}" || return
  if [[ -f "${CURRENT_RELEASE_FILE}" ]]; then
    cp -a "${CURRENT_RELEASE_FILE}" "${STATE_SNAPSHOT_DIR}/current-release.env" || return
  fi
  if [[ -f "${PREVIOUS_RELEASE_FILE}" ]]; then
    cp -a "${PREVIOUS_RELEASE_FILE}" "${STATE_SNAPSHOT_DIR}/previous-release.env" || return
  fi
}

restore_release_state_files() {
  [[ -n "${STATE_SNAPSHOT_DIR}" && -d "${STATE_SNAPSHOT_DIR}" ]] || return 0
  rm -f "${CURRENT_RELEASE_FILE}" "${PREVIOUS_RELEASE_FILE}" || return
  if [[ -f "${STATE_SNAPSHOT_DIR}/current-release.env" ]]; then
    cp -a "${STATE_SNAPSHOT_DIR}/current-release.env" "${CURRENT_RELEASE_FILE}" || return
  fi
  if [[ -f "${STATE_SNAPSHOT_DIR}/previous-release.env" ]]; then
    cp -a "${STATE_SNAPSHOT_DIR}/previous-release.env" "${PREVIOUS_RELEASE_FILE}" || return
  fi
}

prepare_candidate() {
  validate_forward_context || return
  install_server_dependencies || return
  install -d -m 0700 "${STATE_DIR}" "${STATE_DIR}/releases" || return
  load_current_release || return
  XRAY_FINGERPRINT="$(APP_DIR="${APP_DIR}" "${STAGING_DIR}/scripts/production-topology-preflight.sh" fingerprint)" || return
  [[ "${XRAY_FINGERPRINT}" =~ ^[0-9a-f]{64}$ ]] \
    || { fail "Production preflight returned an invalid Xray fingerprint"; return; }
  pull_target_image || return
  write_compose_env "${STAGING_DIR}/deploy" "${APP_IMAGE}" "${DEPLOY_COMMIT_SHA}" "${IMAGE_DIGEST}" "${SEMANTIC_IMAGE}" || return
  chmod 0600 "${STAGING_DIR}/deploy/production.env" || return
  staging_compose config --quiet || return
  staging_compose pull caddy >/dev/null || return
  staging_compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null || return
  haproxy -c -f "${STAGING_DIR}/deploy/haproxy.cfg" >/dev/null || return
}

service_exists() {
  production_compose config --services | grep -qx "$1"
}

service_is_running() {
  production_compose ps --status running --services | grep -qx "$1"
}

verify_current_release_before_snapshot() {
  if [[ "${CURRENT_WAS_IMMUTABLE}" == "1" ]]; then
    wait_for_internal_release \
      "$(release_version_json "${CURRENT_COMMIT_SHA}" "${CURRENT_IMAGE_DIGEST}" "${CURRENT_SCHEMA_VERSION}")"
  else
    wait_for_internal_legacy_health
  fi
}

quiesce_and_snapshot_database() {
  local release_id integrity
  release_id="$(date -u +%Y%m%dT%H%M%SZ)-${DEPLOY_COMMIT_SHA:-manual}"
  RELEASE_WORK_DIR="${STATE_DIR}/releases/${release_id}"
  install -d -m 0700 "${RELEASE_WORK_DIR}" || return
  CONFIG_SNAPSHOT="${RELEASE_WORK_DIR}/configuration.tar.gz"
  DATABASE_SNAPSHOT="${RELEASE_WORK_DIR}/database.sqlite3"
  HAPROXY_SNAPSHOT="${RELEASE_WORK_DIR}/haproxy.cfg"
  [[ -d "${APP_DIR}/deploy" && -d "${APP_DIR}/scripts" ]] \
    || { fail "Current deployment configuration is missing"; return; }
  [[ -f "${DATABASE_PATH}" ]] || { fail "Production database is missing: ${DATABASE_PATH}"; return; }
  tar -czf "${CONFIG_SNAPSHOT}" -C "${APP_DIR}" deploy scripts || return
  chmod 0600 "${CONFIG_SNAPSHOT}" || return
  cp -a /etc/haproxy/haproxy.cfg "${HAPROXY_SNAPSHOT}" || return
  chmod 0600 "${HAPROXY_SNAPSHOT}" || return
  snapshot_release_state_files || return

  APP_WAS_RUNNING=0
  WORKER_WAS_RUNNING=0
  service_is_running app && APP_WAS_RUNNING=1
  [[ "${APP_WAS_RUNNING}" == "1" ]] \
    || { fail "The current app is not running; refusing to snapshot an unhealthy release"; return; }
  if service_exists worker && service_is_running worker; then WORKER_WAS_RUNNING=1; fi
  verify_current_release_before_snapshot || return
  TRANSACTION_MUTATED=1
  if service_exists worker; then production_compose stop worker >/dev/null || return; fi
  production_compose stop app >/dev/null || return

  sqlite3 "${DATABASE_PATH}" ".backup '${DATABASE_SNAPSHOT}'" || return
  chmod 0600 "${DATABASE_SNAPSHOT}" || return
  integrity="$(sqlite3 "${DATABASE_SNAPSHOT}" 'PRAGMA integrity_check;')" || return
  [[ "${integrity}" == "ok" ]] || fail "Deployment database snapshot failed integrity_check: ${integrity}"
}

install_target_configuration() {
  install -d -m 0755 "${APP_DIR}/deploy" "${APP_DIR}/scripts" || return
  rsync -a --delete "${STAGING_DIR}/deploy/" "${APP_DIR}/deploy/" || return
  rsync -a --delete "${STAGING_DIR}/scripts/" "${APP_DIR}/scripts/" || return
  chmod 0600 "${COMPOSE_DIR}/production.env" || return
  write_compose_env "${COMPOSE_DIR}" "${APP_IMAGE}" "${DEPLOY_COMMIT_SHA}" "${IMAGE_DIGEST}" "${SEMANTIC_IMAGE}" || return
  production_compose config --quiet || return
}

migrate_target_database() {
  local actual_schema
  production_compose run --rm --no-deps app pnpm db:migrate >/dev/null || return
  actual_schema="$(sqlite3 "${DATABASE_PATH}" 'select coalesce(max(version), 0) from schema_migrations;')" || return
  [[ "${actual_schema}" == "${EXPECTED_SCHEMA_VERSION}" ]] \
    || fail "Migrated schema ${actual_schema} does not match expected ${EXPECTED_SCHEMA_VERSION}"
}

start_target_app() {
  production_compose up -d semantic app >/dev/null
}

target_version_json() {
  cat <<JSON
{"commit":"${DEPLOY_COMMIT_SHA}","digest":"${IMAGE_DIGEST}","schemaVersion":${EXPECTED_SCHEMA_VERSION}}
JSON
}

release_version_json() {
  local commit="$1" digest="$2" schema="$3"
  printf '{"commit":"%s","digest":"%s","schemaVersion":%s}\n' "${commit}" "${digest}" "${schema}"
}

wait_for_internal_release() {
  local expected_version="$1" health_response version_response
  for _attempt in $(seq 1 60); do
    health_response="$(production_compose exec -T app sh -lc 'wget -qO- http://127.0.0.1:3000/healthz' 2>/dev/null || true)"
    version_response="$(production_compose exec -T app sh -lc 'wget -qO- http://127.0.0.1:3000/version' 2>/dev/null || true)"
    if [[ "${health_response}" == *'"ok":true'* && "${version_response}" == "${expected_version}" ]]; then
      return 0
    fi
    sleep 2
  done
  production_app_logs >&2 || true
  fail "Internal /healthz or exact /version verification failed"
}

wait_for_internal_legacy_health() {
  local health_response
  for _attempt in $(seq 1 60); do
    health_response="$(production_compose exec -T app sh -lc 'wget -qO- http://127.0.0.1:3000/healthz' 2>/dev/null || true)"
    [[ "${health_response}" == *'"ok":true'* ]] && return 0
    sleep 2
  done
  production_app_logs >&2 || true
  fail "Legacy rollback app did not recover /healthz"
}

wait_for_semantic_health() {
  local semantic_response
  for _attempt in $(seq 1 60); do
    semantic_response="$(production_compose exec -T semantic python -c 'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1:8090/healthz", timeout=3).read().decode())' 2>/dev/null || true)"
    if [[ "${semantic_response}" == *'"ok":true'* \
      && "${semantic_response}" == *'ibm-granite/granite-embedding-97m-multilingual-r2'* \
      && "${semantic_response}" == *'cross-encoder/mmarco-mMiniLMv2-L12-H384-v1'* ]]; then
      return 0
    fi
    sleep 2
  done
  production_compose logs --tail=80 semantic >&2 || true
  fail "Semantic /healthz identity verification failed"
}

verify_target_internal() {
  wait_for_internal_release "$(target_version_json)" || return
  wait_for_semantic_health
}

start_recovered_app() {
  if service_exists semantic; then
    production_compose up -d semantic app >/dev/null
  else
    production_compose up -d app >/dev/null
  fi
}

activate_target_proxy() {
  production_compose up -d --force-recreate caddy >/dev/null || return
  production_compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null || return
  production_compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null || return
  "${APP_DIR}/scripts/install-haproxy-config.sh" "${APP_DIR}/deploy/haproxy.cfg" || return
}

public_request() {
  curl -fsS --max-time 15 --resolve blog.leesaitool.com:443:127.0.0.1 "$@"
}

verify_public_headers() {
  local header_file
  header_file="$(mktemp)" || return
  if ! public_request -D "${header_file}" -o /dev/null "${PUBLIC_URL}/healthz" \
    || ! grep -qi '^strict-transport-security:' "${header_file}" \
    || ! grep -qi '^x-content-type-options:' "${header_file}" \
    || ! grep -qi '^referrer-policy:' "${header_file}" \
    || ! grep -qi '^content-security-policy:.*frame-ancestors' "${header_file}" \
    || ! grep -qi '^permissions-policy:.*camera=()' "${header_file}" \
    || grep -qi '^x-powered-by:' "${header_file}"; then
    rm -f "${header_file}"
    fail "Public security-header verification failed"
    return
  fi
  rm -f "${header_file}"
}

wait_for_public_release() {
  local expected_version="$1" health_response version_response
  for _attempt in $(seq 1 60); do
    health_response="$(public_request "${PUBLIC_URL}/healthz" 2>/dev/null || true)"
    version_response="$(public_request "${PUBLIC_URL}/version" 2>/dev/null || true)"
    if [[ "${health_response}" == *'"ok":true'* && "${version_response}" == "${expected_version}" ]]; then
      verify_public_headers || return
      return 0
    fi
    sleep 2
  done
  fail "Public /healthz or exact /version verification failed"
}

verify_target_public() {
  local studio_status
  wait_for_public_release "$(target_version_json)" || return
  studio_status="$(public_request -o /dev/null -w '%{http_code}' "${PUBLIC_URL}/studio" 2>/dev/null || true)"
  [[ "${studio_status}" == "404" ]] || { fail "The public hostname still exposes Studio"; return; }
  if curl -fsS --max-time 10 --resolve studio.blog.leesaitool.com:443:127.0.0.1 "${STUDIO_URL}/studio/login" >/dev/null 2>&1; then
    fail "The Studio hostname accepted a request without a client certificate"
  fi
}

start_target_worker() {
  production_compose up -d worker >/dev/null || return
  for _attempt in $(seq 1 30); do
    service_is_running worker && return 0
    sleep 1
  done
  production_compose logs --tail=80 worker >&2 || true
  fail "Worker did not remain running"
}

finalize_forward_release() {
  APP_DIR="${APP_DIR}" "${APP_DIR}/scripts/production-topology-preflight.sh" \
    verify "${XRAY_FINGERPRINT}" --expect-topology || return
  if [[ "${CURRENT_WAS_IMMUTABLE}" == "1" ]]; then
    write_release_file "${PREVIOUS_RELEASE_FILE}" \
      "${CURRENT_APP_IMAGE}" "${CURRENT_COMMIT_SHA}" "${CURRENT_IMAGE_DIGEST}" "${CURRENT_SCHEMA_VERSION}" \
      "${CURRENT_SEMANTIC_IMAGE}" "${CURRENT_SEMANTIC_IMAGE_DIGEST}" \
      "${CONFIG_SNAPSHOT}" "${DATABASE_SNAPSHOT}" "${HAPROXY_SNAPSHOT}" || return
  else
    rm -f "${PREVIOUS_RELEASE_FILE}" || return
  fi
  write_release_file "${CURRENT_RELEASE_FILE}" \
    "${APP_IMAGE}" "${DEPLOY_COMMIT_SHA}" "${IMAGE_DIGEST}" "${EXPECTED_SCHEMA_VERSION}" \
    "${SEMANTIC_IMAGE}" "${SEMANTIC_IMAGE_DIGEST}" || return
}

restore_database() {
  local snapshot="$1" temporary
  [[ -f "${snapshot}" ]] || { fail "Rollback database snapshot is missing"; return; }
  temporary="${DATABASE_PATH}.rollback.$$"
  install -m 0644 "${snapshot}" "${temporary}" || return
  rm -f "${DATABASE_PATH}-wal" "${DATABASE_PATH}-shm" || return
  mv -f "${temporary}" "${DATABASE_PATH}" || return
}

restore_configuration() {
  local config_snapshot="$1" haproxy_snapshot="$2"
  [[ -f "${config_snapshot}" && -f "${haproxy_snapshot}" ]] \
    || { fail "Rollback configuration snapshot is missing"; return; }
  rm -rf "${APP_DIR}/deploy" "${APP_DIR}/scripts" || return
  tar -xzf "${config_snapshot}" -C "${APP_DIR}" || return
  install -m 0644 "${haproxy_snapshot}" "${APP_DIR}/deploy/haproxy.cfg" || return
}

install_recovered_haproxy() {
  local source="$1" target="/etc/haproxy/haproxy.cfg"
  [[ -f "${source}" ]] || { fail "Recovered HAProxy config is missing"; return; }
  haproxy -c -f "${source}" >/dev/null || return
  install -m 0644 "${source}" "${target}" || return
  haproxy -c -f "${target}" >/dev/null || return
  systemctl reload haproxy.service || return
  systemctl is-active --quiet haproxy.service || return
}

activate_recovered_proxy() {
  production_compose up -d --force-recreate caddy >/dev/null || return
  production_compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null || return
  production_compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null || return
  install_recovered_haproxy "${APP_DIR}/deploy/haproxy.cfg" || return
}

verify_previous_release() {
  local expected
  if [[ "${CURRENT_WAS_IMMUTABLE}" == "1" ]]; then
    expected="$(release_version_json "${CURRENT_COMMIT_SHA}" "${CURRENT_IMAGE_DIGEST}" "${CURRENT_SCHEMA_VERSION}")"
    wait_for_internal_release "${expected}" || return
    if service_exists semantic; then wait_for_semantic_health || return; fi
    activate_recovered_proxy || return
    wait_for_public_release "${expected}" || return
  else
    wait_for_internal_legacy_health || return
    activate_recovered_proxy || return
    public_request "${PUBLIC_URL}/healthz" | grep -q '"ok":true' || return
  fi
}

rollback_candidate() {
  [[ "${TRANSACTION_MUTATED}" == "1" ]] || return 0
  production_compose stop worker >/dev/null 2>&1 || true
  production_compose stop app >/dev/null 2>&1 || true
  if service_exists semantic; then production_compose stop semantic >/dev/null 2>&1 || true; fi
  if [[ -n "${CONFIG_SNAPSHOT}" && -f "${CONFIG_SNAPSHOT}" ]]; then
    restore_configuration "${CONFIG_SNAPSHOT}" "${HAPROXY_SNAPSHOT}" || return 1
  fi
  if [[ -n "${DATABASE_SNAPSHOT}" && -f "${DATABASE_SNAPSHOT}" ]]; then
    restore_database "${DATABASE_SNAPSHOT}" || return 1
  fi
  restore_release_state_files || return 1
  start_recovered_app || return 1
  verify_previous_release || return 1
  if [[ "${WORKER_WAS_RUNNING}" == "1" ]] && service_exists worker; then
    production_compose up -d worker >/dev/null || return 1
    service_is_running worker || return 1
  fi
  APP_DIR="${APP_DIR}" "${APP_DIR}/scripts/production-topology-preflight.sh" verify "${XRAY_FINGERPRINT}" || return 1
}

run_forward_release() {
  local step step_status
  if prepare_candidate; then
    :
  else
    return $?
  fi
  for step in \
    quiesce_and_snapshot_database \
    install_target_configuration \
    migrate_target_database \
    start_target_app \
    verify_target_internal \
    activate_target_proxy \
    verify_target_public \
    start_target_worker \
    finalize_forward_release; do
    if "${step}"; then
      continue
    else
      step_status=$?
    fi
    echo "Forward release step ${step} failed; restoring the previous release." >&2
    if rollback_candidate; then
      echo "Deployment failed, and the previous release was restored." >&2
      return "${step_status}"
    fi
    echo "Deployment and automatic rollback both failed." >&2
    return 70
  done
}

load_recorded_previous() {
  [[ -f "${PREVIOUS_RELEASE_FILE}" ]] \
    || { fail "No previous-release.env is recorded; refusing manual rollback"; return; }
  load_release_file "${PREVIOUS_RELEASE_FILE}" || return
  [[ "${RELEASE_CONFIG_SNAPSHOT:-}" == "${STATE_DIR}"/releases/* && -f "${RELEASE_CONFIG_SNAPSHOT}" ]] \
    || { fail "Recorded previous configuration snapshot is invalid"; return; }
  [[ "${RELEASE_DATABASE_SNAPSHOT:-}" == "${STATE_DIR}"/releases/* && -f "${RELEASE_DATABASE_SNAPSHOT}" ]] \
    || { fail "Recorded previous database snapshot is invalid"; return; }
  [[ "${RELEASE_HAPROXY_SNAPSHOT:-}" == "${STATE_DIR}"/releases/* && -f "${RELEASE_HAPROXY_SNAPSHOT}" ]] \
    || { fail "Recorded previous HAProxy snapshot is invalid"; return; }
}

run_recorded_rollback() {
  local target_image target_semantic_image target_commit target_digest target_semantic_digest target_schema
  local target_config target_database target_haproxy rollback_status
  local backout_config backout_database backout_haproxy
  [[ "$(id -u)" == "0" ]] || { fail "Remote rollback must run as root"; return; }
  [[ -n "${REGISTRY_USERNAME}" ]] || { fail "REGISTRY_USERNAME is required"; return; }
  install_server_dependencies || return
  install -d -m 0700 "${STATE_DIR}" "${STATE_DIR}/releases" || return
  load_current_release || return
  [[ "${CURRENT_WAS_IMMUTABLE}" == "1" ]] || { fail "Current release is not an immutable recorded release"; return; }
  load_recorded_previous || return
  target_image="${RELEASE_APP_IMAGE}"
  target_semantic_image="${RELEASE_SEMANTIC_IMAGE:-}"
  target_commit="${RELEASE_COMMIT_SHA}"
  target_digest="${RELEASE_IMAGE_DIGEST}"
  target_semantic_digest="${RELEASE_SEMANTIC_IMAGE_DIGEST:-}"
  target_schema="${RELEASE_SCHEMA_VERSION}"
  target_config="${RELEASE_CONFIG_SNAPSHOT}"
  target_database="${RELEASE_DATABASE_SNAPSHOT}"
  target_haproxy="${RELEASE_HAPROXY_SNAPSHOT}"
  XRAY_FINGERPRINT="$(APP_DIR="${APP_DIR}" "${APP_DIR}/scripts/production-topology-preflight.sh" fingerprint)" || return
  pull_recorded_image "${target_image}" "${target_commit}" "${target_semantic_image}" || return

  DEPLOY_COMMIT_SHA="manual-${CURRENT_COMMIT_SHA}"
  if quiesce_and_snapshot_database; then
    :
  else
    rollback_status=$?
    if rollback_candidate; then return "${rollback_status}"; fi
    return 70
  fi
  backout_config="${CONFIG_SNAPSHOT}"
  backout_database="${DATABASE_SNAPSHOT}"
  backout_haproxy="${HAPROXY_SNAPSHOT}"
  if restore_configuration "${target_config}" "${target_haproxy}" \
    && restore_database "${target_database}" \
    && start_recovered_app \
    && wait_for_internal_release "$(release_version_json "${target_commit}" "${target_digest}" "${target_schema}")" \
    && { ! service_exists semantic || wait_for_semantic_health; } \
    && activate_recovered_proxy \
    && wait_for_public_release "$(release_version_json "${target_commit}" "${target_digest}" "${target_schema}")" \
    && production_compose up -d worker >/dev/null \
     && service_is_running worker \
     && APP_DIR="${APP_DIR}" "${APP_DIR}/scripts/production-topology-preflight.sh" verify "${XRAY_FINGERPRINT}" --expect-topology; then
    if write_release_file "${PREVIOUS_RELEASE_FILE}" \
      "${CURRENT_APP_IMAGE}" "${CURRENT_COMMIT_SHA}" "${CURRENT_IMAGE_DIGEST}" "${CURRENT_SCHEMA_VERSION}" \
      "${CURRENT_SEMANTIC_IMAGE}" "${CURRENT_SEMANTIC_IMAGE_DIGEST}" \
      "${backout_config}" "${backout_database}" "${backout_haproxy}" \
      && write_release_file "${CURRENT_RELEASE_FILE}" \
        "${target_image}" "${target_commit}" "${target_digest}" "${target_schema}" \
        "${target_semantic_image}" "${target_semantic_digest}"; then
      return 0
    else
      rollback_status=$?
    fi
  else
    rollback_status=$?
  fi

  CONFIG_SNAPSHOT="${backout_config}"
  DATABASE_SNAPSHOT="${backout_database}"
  HAPROXY_SNAPSHOT="${backout_haproxy}"
  if rollback_candidate; then return "${rollback_status}"; fi
  return 70
}

main() {
  local mode="${1:-forward}"
  case "${mode}" in
    validate-inputs)
      validate_release_inputs
      ;;
    forward)
      acquire_maintenance_lock "${mode}"
      run_forward_release
      ;;
    rollback)
      acquire_maintenance_lock "${mode}"
      run_recorded_rollback
      ;;
    *)
      echo "Usage: remote-release.sh [validate-inputs|forward|rollback]" >&2
      return 2
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
