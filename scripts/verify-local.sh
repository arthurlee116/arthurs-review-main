#!/usr/bin/env bash
# The project's test gate (CI no longer runs tests). Runs on this Mac with Apple
# `container`, mirroring production as closely as an arm64 laptop can:
#   1. lint + vitest + pytest            ┐ in parallel
#   2. build base/semantic/app images    ┘
#   3. start semantic + app + worker from the built production image
#   4. Playwright against it
# Flags / env:
#   --skip-e2e          only step 1 (fast pre-commit style check)
#   --keep              leave the stack running afterwards (http://127.0.0.1:3100)
#   LOCAL_BUILD_DNS     DNS for the builder/containers (default 1.1.1.1; the vmnet
#                       resolver fails on some hosts, e.g. github.com behind a TUN VPN)
#   LOCAL_BUILDER_CPUS / LOCAL_BUILDER_MEMORY   builder VM size (default 8 / 12g)
#   PLAYWRIGHT_ARGS     extra args, e.g. PLAYWRIGHT_ARGS='-g studio --project chromium'
set -Eeuo pipefail
cd "$(dirname "$0")/.."

SKIP_E2E=0
KEEP=0
for arg in "$@"; do
  case "${arg}" in
    --skip-e2e) SKIP_E2E=1 ;;
    --keep) KEEP=1 ;;
    *) echo "unknown argument: ${arg}" >&2; exit 2 ;;
  esac
done

DNS="${LOCAL_BUILD_DNS:-1.1.1.1}"
BUILDER_CPUS="${LOCAL_BUILDER_CPUS:-8}"
BUILDER_MEMORY="${LOCAL_BUILDER_MEMORY:-12g}"
REPO="ghcr.io/arthurlee116/arthurs-review-main"
APP_IMAGE="arthurs-review-local:app"
PREFIX="arthurs-review-local"
APP="${PREFIX}-app"
SEMANTIC="${PREFIX}-semantic"
VOLUME="${PREFIX}-data"
COMMIT="$(git rev-parse HEAD)"
ADMIN_HASH='scrypt$16384$8$1$YXJ0aHVycy1yZXZpZXctZTJl$B8w4AkTlSV2dCTJRqSbGGTODO+tbdf5CGiHMVKwR0JDtZTLg0Y2OufUAJ+wcBHuagSp1C/tvIpU/cD8/51AdGQ=='
SESSION="0123456789abcdefghijklmnopqrstuvwxyzABCDEF"
ZERO_DIGEST="sha256:0000000000000000000000000000000000000000000000000000000000000000"
ANALYTICS_TOKEN="00000000000000000000000000000000"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/arthurs-review-verify.XXXXXX")"
eval "$(scripts/image-tags.sh)"

started_at=$SECONDS
step() { printf '\n\033[1m▶ %s\033[0m (+%ss)\n' "$*" "$((SECONDS - started_at))"; }

image_exists() { container image inspect "$1" >/dev/null 2>&1; }

# Apple container (1.6.x) cannot pack a build context that contains a Unix socket
# anywhere, even under an ignored directory — and tools like CodeGraph keep a live
# daemon.sock in the repo. Build from a staged copy of the files git would ship.
CONTEXT="${TMPDIR:-/tmp}/arthurs-review-build-context"
stage_context() {
  rm -rf "${CONTEXT}"
  mkdir -p "${CONTEXT}"
  # (deleted-but-still-tracked paths are skipped)
  git ls-files -z --cached --others --exclude-standard \
    | perl -0 -ne 'chomp; print "$_\0" if -e' \
    | tar --null -T - -cf - | tar -xpf - -C "${CONTEXT}"
}

remove_stack() {
  container rm -f "${APP}" "${SEMANTIC}" >/dev/null 2>&1 || true
  container volume rm "${VOLUME}" >/dev/null 2>&1 || true
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  jobs -p | xargs -r kill 2>/dev/null || true
  if [[ "${status}" != 0 && -n "${STACK_STARTED:-}" ]]; then
    container logs "${APP}" >"${LOG_DIR}/app.log" 2>&1 || true
    container logs "${SEMANTIC}" >"${LOG_DIR}/semantic.log" 2>&1 || true
    echo "Container logs: ${LOG_DIR}" >&2
  fi
  if [[ "${KEEP}" != 1 && -n "${STACK_STARTED:-}" ]]; then remove_stack; fi
  [[ "${status}" == 0 ]] && rm -rf "${LOG_DIR}"
  exit "${status}"
}
trap cleanup EXIT INT TERM

build_images() {
  # Builder resources must be passed on every build: a build that changes builder
  # options (e.g. --dns) recreates the builder VM, which defaults to 2 CPUs / 2 GB —
  # too little for `next build`, which then stalls instead of failing.
  local build=(container build --dns "${DNS}" -c "${BUILDER_CPUS}" -m "${BUILDER_MEMORY}" --progress plain)
  stage_context
  if ! image_exists "${REPO}:base-build-${BASE_TAG}"; then
    echo "base ${BASE_TAG} missing locally: compiling libvips (one-off, a few minutes)"
    "${build[@]}" -f docker/base.Dockerfile --target runtime -t "${REPO}:base-runtime-${BASE_TAG}" "${CONTEXT}/docker"
    "${build[@]}" -f docker/base.Dockerfile --target build -t "${REPO}:base-build-${BASE_TAG}" "${CONTEXT}/docker"
  fi
  if ! image_exists "${REPO}-semantic:${SEMANTIC_TAG}"; then
    "${build[@]}" -f semantic.Dockerfile --build-arg "SEMANTIC_TAG=${SEMANTIC_TAG}" \
      -t "${REPO}-semantic:${SEMANTIC_TAG}" "${CONTEXT}"
  fi
  "${build[@]}" -t "${APP_IMAGE}" \
    --build-arg "BASE_IMAGE=${REPO}" --build-arg "BASE_TAG=${BASE_TAG}" \
    --build-arg SITE_URL=https://blog.leesaitool.com \
    --build-arg "NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=${ANALYTICS_TOKEN}" \
    --build-arg "GIT_COMMIT_SHA=${COMMIT}" "${CONTEXT}"
}

# Run named checks concurrently; print the log of each one that fails.
run_parallel() {
  local names=() pids=() name failed=0 i
  while (($#)); do
    name="$1"; shift
    ("$1" >"${LOG_DIR}/${name}.log" 2>&1) &
    names+=("${name}"); pids+=("$!"); shift
  done
  for i in "${!pids[@]}"; do
    if wait "${pids[$i]}"; then
      echo "  ✓ ${names[$i]}"
    else
      echo "  ✗ ${names[$i]}"; tail -60 "${LOG_DIR}/${names[$i]}.log" | sed 's/^/    /'; failed=1
    fi
  done
  return "${failed}"
}

lint() { pnpm lint; }
unit() { pnpm test; }
pytest_semantic() { uv run --quiet --directory semantic --extra test pytest -q; }

step "lint, unit tests, pytest$([[ "${SKIP_E2E}" == 1 ]] || echo ", image builds")"
if [[ "${SKIP_E2E}" == 1 ]]; then
  run_parallel lint lint unit unit pytest pytest_semantic
  step "done"
  exit 0
fi
container system status >/dev/null 2>&1 || container system start
run_parallel lint lint unit unit pytest pytest_semantic images build_images

step "starting semantic + app + worker"
remove_stack
STACK_STARTED=1
container volume create "${VOLUME}" >/dev/null
container run -d --name "${SEMANTIC}" --dns "${DNS}" -m 2g -c 2 \
  -e SEMANTIC_RERANK_ENABLED=1 "${REPO}-semantic:${SEMANTIC_TAG}" >/dev/null

# Seed while the semantic models load. The worker later runs *inside* the app
# container: each Apple container is its own VM, and SQLite locking/WAL shared
# memory does not work across VMs on one volume.
container run --rm -v "${VOLUME}:/data" -m 2g \
  -e DATA_DIR=/data -e SITE_URL=https://blog.leesaitool.com -e E2E_LISTING_FIXTURES=1 \
  -e ADMIN_PASSWORD_HASH="${ADMIN_HASH}" -e SESSION_SECRET="${SESSION}" \
  "${APP_IMAGE}" pnpm seed >"${LOG_DIR}/seed.log" 2>&1 || { cat "${LOG_DIR}/seed.log"; exit 1; }

semantic_ip="$(container inspect "${SEMANTIC}" | node -e '
  const [c] = JSON.parse(require("fs").readFileSync(0, "utf8"));
  console.log(c.status.networks[0].ipv4Address.split("/")[0]);
')"
semantic_env=(
  -e "SEMANTIC_SEARCH_URL=http://${semantic_ip}:8090"
  -e SEMANTIC_SEARCH_MODEL_ID=ibm-granite/granite-embedding-97m-multilingual-r2
  -e SEMANTIC_SEARCH_MODEL_REVISION=835ad14087e140460703cf0fae09f97d469d65c2
  -e SEMANTIC_SEARCH_DIMENSION=384
  -e SEMANTIC_RERANK_MODEL_ID=cross-encoder/mmarco-mMiniLMv2-L12-H384-v1
  -e SEMANTIC_RERANK_MODEL_REVISION=1427fd652930e4ba29e8149678df786c240d8825
  -e SEMANTIC_RERANK_ENABLED=1
)
container run -d --name "${APP}" -m 4g -c 4 -p 127.0.0.1:3100:3000 -v "${VOLUME}:/data" \
  -e DATA_DIR=/data -e SITE_URL=https://blog.leesaitool.com \
  -e ADMIN_PASSWORD_HASH="${ADMIN_HASH}" -e SESSION_SECRET="${SESSION}" \
  -e LOGIN_RATE_LIMIT_MAX=100 -e WORKER_REVALIDATE_SECRET=e2e-worker-revalidate-secret \
  -e INTERNAL_APP_URL=http://127.0.0.1:3000 -e OTS_CLI_PATH=/bin/false \
  -e DEPLOY_COMMIT_SHA="${COMMIT}" -e IMAGE_DIGEST="${ZERO_DIGEST}" \
  "${semantic_env[@]}" "${APP_IMAGE}" >/dev/null

wait_until() {
  local what="$1" tries="$2"; shift 2
  for _ in $(seq 1 "${tries}"); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for ${what}" >&2
  return 1
}
semantic_healthy() {
  container exec "${SEMANTIC}" python -c 'import json,urllib.request; assert json.load(urllib.request.urlopen("http://127.0.0.1:8090/healthz", timeout=3))["ok"]'
}
app_healthy() { curl -fsS --noproxy '*' http://127.0.0.1:3100/healthz | grep -q '"ok":true'; }
wait_until "semantic /healthz" 180 semantic_healthy
wait_until "app /healthz" 120 app_healthy

container exec "${APP}" node -e '
  const base = process.env.SEMANTIC_SEARCH_URL;
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const health = await fetch(base + "/healthz").then((r) => r.json());
  if (!health.ok || health.embedding.dimension !== 384) process.exit(1);
  const embedded = await post("/embed", { kind: "query", texts: ["人的价值是什么"] });
  if (embedded.vectors.length !== 1 || embedded.vectors[0].length !== 384) process.exit(1);
  const reranked = await post("/rerank", { query: "人的价值", candidates: [{ id: "a", text: "人是目的，而不是工具。" }] });
  if (reranked.scores[0].id !== "a") process.exit(1);
  await import("sharp");
  if (!(await import("node:fs")).readFileSync("/proc/self/maps", "utf8").includes("/usr/lib/libvips.so.42")) { console.error("sharp is not using the HEVC-capable libvips"); process.exit(1); }
'
container exec -d "${APP}" pnpm jobs:work

jobs_settled() {
  [[ "$(container exec "${APP}" node -e '
    const db = new (require("better-sqlite3"))("/data/arthurs-review.sqlite3", { readonly: true });
    const pending = (type) => db.prepare("select count(*) as count from jobs where type = ? and status in (?, ?)").get(type, "queued", "running").count;
    const missing = db.prepare("select count(*) as count from articles where published_revision_id is not null and not exists (select 1 from article_embedding_chunks where article_id = articles.id and revision_id = articles.published_revision_id and model_id = ? and model_revision = ? and dimension = ?)").get("ibm-granite/granite-embedding-97m-multilingual-r2", "835ad14087e140460703cf0fae09f97d469d65c2", 384).count;
    console.log(`${pending("cache.invalidate")}:${pending("search.embed")}:${missing}`);
  ')" == "0:0:0" ]]
}
wait_until "cache + semantic indexing jobs" 180 jobs_settled

step "Playwright"
# shellcheck disable=SC2086
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
E2E_EXPECTED_SITE_URL=https://blog.leesaitool.com \
E2E_EXPECTED_COMMIT="${COMMIT}" \
E2E_EXPECTED_DIGEST="${ZERO_DIGEST}" \
E2E_ADMIN_PASSWORD=admin-password \
E2E_EXPECT_SEMANTIC=1 \
NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN="${ANALYTICS_TOKEN}" \
  pnpm exec playwright test ${PLAYWRIGHT_ARGS:-}

step "all checks passed"
[[ "${KEEP}" == 1 ]] && echo "Stack left running at http://127.0.0.1:3100 (scripts/verify-local.sh cleans it up next run)"
exit 0
