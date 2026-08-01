import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runReleaseHarness({ failAt = "", rollbackFails = false }: { failAt?: string; rollbackFails?: boolean } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-release-test-"));
  const log = path.join(directory, "events.log");
  const harness = `
set -u
source scripts/remote-release.sh
record() { printf '%s\\n' "$1" >> "$RELEASE_TEST_LOG"; }
step() { record "$1"; [[ "$FAIL_AT" != "$1" ]]; }
prepare_candidate() { step prepare; }
quiesce_and_snapshot_database() { step snapshot; }
install_target_configuration() { step install; }
migrate_target_database() { step migrate; }
start_target_app() { step app; }
verify_target_internal() { step internal; }
activate_target_proxy() { step proxy; }
verify_target_public() { step version; }
start_target_worker() { step worker; }
finalize_forward_release() { step finalize; }
rollback_candidate() { record rollback; [[ "$ROLLBACK_FAILS" != 1 ]]; }
run_forward_release
`;
  const result = spawnSync("bash", ["-c", harness], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      RELEASE_TEST_LOG: log,
      FAIL_AT: failAt,
      ROLLBACK_FAILS: rollbackFails ? "1" : "0",
    },
  });
  const events = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  fs.rmSync(directory, { recursive: true, force: true });
  return { status: result.status, stderr: result.stderr, events };
}

function validateReleaseInputs(appImage: string, semanticImage = `ghcr.io/arthurlee116/arthurs-review-main-semantic@sha256:${"c".repeat(64)}`) {
  return spawnSync("bash", ["-c", 'source scripts/remote-release.sh; if validate_release_inputs; then exit 0; else exit 1; fi'], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      APP_IMAGE: appImage,
      SEMANTIC_IMAGE: semanticImage,
      DEPLOY_COMMIT_SHA: "a".repeat(40),
      IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
      SEMANTIC_IMAGE_DIGEST: `sha256:${"c".repeat(64)}`,
      EXPECTED_SCHEMA_VERSION: "9",
      REGISTRY_USERNAME: "ci-user",
    },
  });
}

function runManualRollbackHarness({ snapshotFails = false, stateWriteFails = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-manual-rollback-test-"));
  const appDirectory = path.join(directory, "app");
  const log = path.join(directory, "events.log");
  const preflight = path.join(appDirectory, "scripts", "production-topology-preflight.sh");
  fs.mkdirSync(path.dirname(preflight), { recursive: true });
  fs.writeFileSync(preflight, `#!/usr/bin/env bash\nif [[ "\${1:-}" == fingerprint ]]; then printf '%s\\n' '${"c".repeat(64)}'; fi\n`);
  fs.chmodSync(preflight, 0o700);

  const harness = `
source scripts/remote-release.sh
record() { printf '%s\\n' "$1" >> "$RELEASE_TEST_LOG"; }
id() { printf '0\\n'; }
install_server_dependencies() { :; }
load_current_release() {
  CURRENT_WAS_IMMUTABLE=1
  CURRENT_APP_IMAGE="ghcr.io/example/blog@sha256:${"d".repeat(64)}"
  CURRENT_COMMIT_SHA="${"e".repeat(40)}"
  CURRENT_IMAGE_DIGEST="sha256:${"d".repeat(64)}"
  CURRENT_SCHEMA_VERSION=8
}
load_recorded_previous() {
  RELEASE_APP_IMAGE="ghcr.io/example/blog@sha256:${"f".repeat(64)}"
  RELEASE_COMMIT_SHA="${"a".repeat(40)}"
  RELEASE_IMAGE_DIGEST="sha256:${"f".repeat(64)}"
  RELEASE_SCHEMA_VERSION=7
  RELEASE_CONFIG_SNAPSHOT="$STATE_DIR/target-config.tar.gz"
  RELEASE_DATABASE_SNAPSHOT="$STATE_DIR/target.sqlite3"
  RELEASE_HAPROXY_SNAPSHOT="$STATE_DIR/target-haproxy.cfg"
}
pull_recorded_image() { record pull; }
quiesce_and_snapshot_database() {
  record snapshot
  CONFIG_SNAPSHOT="$STATE_DIR/backout-config.tar.gz"
  DATABASE_SNAPSHOT="$STATE_DIR/backout.sqlite3"
  HAPROXY_SNAPSHOT="$STATE_DIR/backout-haproxy.cfg"
  [[ "$SNAPSHOT_FAILS" != 1 ]]
}
restore_configuration() { record restore-config; }
restore_database() { record restore-db; }
production_compose() { record "compose:$*"; }
wait_for_internal_release() { record internal; }
activate_recovered_proxy() { record proxy; }
wait_for_public_release() { record public; }
service_is_running() { record worker; }
write_release_file() {
  record "state:$1"
  if [[ "$STATE_WRITE_FAILS" == 1 && "$1" == "$CURRENT_RELEASE_FILE" ]]; then return 1; fi
}
rollback_candidate() { record rollback; }
run_recorded_rollback
`;
  const result = spawnSync("bash", ["-c", harness], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      APP_DIR: appDirectory,
      STATE_DIR: path.join(directory, "state"),
      REGISTRY_USERNAME: "ci-user",
      RELEASE_TEST_LOG: log,
      SNAPSHOT_FAILS: snapshotFails ? "1" : "0",
      STATE_WRITE_FAILS: stateWriteFails ? "1" : "0",
    },
  });
  const events = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  fs.rmSync(directory, { recursive: true, force: true });
  return { status: result.status, stderr: result.stderr, events };
}

function runUnmutatedRollbackHarness() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-unmutated-rollback-test-"));
  const log = path.join(directory, "events.log");
  const harness = `
source scripts/remote-release.sh
record() { printf '%s\\n' "$1" >> "$RELEASE_TEST_LOG"; }
production_compose() { record "compose:$*"; }
restore_release_state_files() { record state; }
verify_previous_release() { record verify; }
rollback_candidate
`;
  const result = spawnSync("bash", ["-c", harness], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, RELEASE_TEST_LOG: log },
  });
  const events = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  fs.rmSync(directory, { recursive: true, force: true });
  return { status: result.status, events };
}

describe("deployment scripts", () => {
  it("installs an automatic daily backup schedule during server bootstrap", () => {
    const bootstrap = fs.readFileSync("scripts/server-bootstrap.sh", "utf8");
    const deploymentReadme = fs.readFileSync("deploy/README.md", "utf8");

    expect(bootstrap).toContain("arthurs-review-backup");
    expect(bootstrap).toContain("backup-data.sh");
    expect(bootstrap).toContain("/etc/cron.d");
    expect(bootstrap).toContain("centos");
    expect(bootstrap).toContain("dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo");
    expect(bootstrap).toContain('cron_service="crond"');
    expect(bootstrap).toContain("systemctl enable --now docker");
    expect(deploymentReadme).toContain("CentOS Stream 9");
  });

  it("creates complete verified backups and copies them off the VPS", () => {
    const backup = fs.readFileSync("scripts/backup-data.sh", "utf8");
    const bootstrap = fs.readFileSync("scripts/server-bootstrap.sh", "utf8");

    expect(backup).toContain("backup-database.ts");
    expect(backup).toContain("markdown uploads proofs");
    expect(backup).toContain("MANIFEST.sha256");
    expect(backup).toContain(".partial");
    expect(backup).toContain("verify-backup.sh");
    expect(bootstrap).toContain("sqlite3");
    expect(fs.existsSync("scripts/verify-backup.sh")).toBe(true);
    expect(fs.existsSync(".github/workflows/backup.yml")).toBe(true);

    const workflow = fs.readFileSync(".github/workflows/backup.yml", "utf8");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("scripts/verify-backup.sh");
    expect(workflow).toContain("actions/upload-artifact@v7");
    expect(workflow).toContain("retention-days: 30");
    expect(workflow).toContain("-mtime -1");
    expect(workflow).not.toContain("backup-data.sh");
  });

  it("runs the off-site copy after the server-local backup window", () => {
    const bootstrap = fs.readFileSync("scripts/server-bootstrap.sh", "utf8");
    const workflow = fs.readFileSync(".github/workflows/backup.yml", "utf8");

    expect(bootstrap).toContain("0 3 * * * root");
    expect(workflow).toContain('- cron: "30 3 * * *"\n      timezone: "America/New_York"');
  });

  it("retries transient SSH failures while copying backups for verification", () => {
    for (const workflowPath of [".github/workflows/backup.yml", ".github/workflows/restore-drill.yml"]) {
      const workflow = fs.readFileSync(workflowPath, "utf8");

      expect(workflow).toContain("ConnectTimeout ");
      expect(workflow).toContain("ServerAliveInterval 15");
      expect(workflow).toContain("retry_network()");
      expect(workflow).toContain("retry_network ssh");
      expect(workflow).toContain("retry_network scp");
    }
  });

  it("quiesces article writes while snapshotting SQLite and content files", () => {
    const backup = fs.readFileSync("scripts/backup-data.sh", "utf8");
    const stop = backup.indexOf("docker compose stop app worker");
    const snapshot = backup.indexOf("docker compose run --rm --no-deps app");
    const copy = backup.indexOf('for directory in markdown uploads proofs');
    const restart = backup.lastIndexOf("\nrestore_services\n");

    expect(stop).toBeGreaterThanOrEqual(0);
    expect(stop).toBeLessThan(snapshot);
    expect(snapshot).toBeLessThan(copy);
    expect(copy).toBeLessThan(restart);
    expect(backup).toContain("/healthz");
    expect(backup).toContain("docker compose ps --status running --services");
    expect(backup).toContain("docker compose up -d app worker");
  });

  it("uses one server maintenance lock for backup, deployment, and restore", () => {
    for (const script of ["scripts/backup-data.sh", "scripts/deploy.sh", "scripts/remote-release.sh", "scripts/restore-backup.sh"]) {
      const source = fs.readFileSync(script, "utf8");
      expect(source).toContain("/var/lock/arthurs-review-maintenance.lock");
      expect(source).toContain("flock");
    }

    const backup = fs.readFileSync("scripts/backup-data.sh", "utf8");
    const deploy = fs.readFileSync("scripts/deploy.sh", "utf8");
    const remoteRelease = fs.readFileSync("scripts/remote-release.sh", "utf8");
    const restore = fs.readFileSync("scripts/restore-backup.sh", "utf8");
    expect(backup.indexOf("exec flock")).toBeLessThan(backup.indexOf("docker compose stop app worker"));
    expect(deploy).toContain("MAINTENANCE_LOCK_FILE");
    expect(deploy).toContain("remote-release.sh");
    expect(remoteRelease.indexOf("exec flock")).toBeLessThan(remoteRelease.indexOf("run_forward_release"));
    expect(remoteRelease).toContain('mkdir -p "$(dirname "${MAINTENANCE_LOCK_FILE}")"');
    expect(remoteRelease).not.toContain('install -d -m 0700 "$(dirname "${MAINTENANCE_LOCK_FILE}")"');
    expect(restore.indexOf("exec flock")).toBeLessThan(restore.indexOf('${SCRIPT_DIR}/verify-backup.sh'));
  });

  it("runs monthly restore drills only against an isolated backup copy", () => {
    expect(fs.existsSync("scripts/restore-backup.sh")).toBe(true);
    expect(fs.existsSync(".github/workflows/restore-drill.yml")).toBe(true);

    const restore = fs.readFileSync("scripts/restore-backup.sh", "utf8");
    const workflow = fs.readFileSync(".github/workflows/restore-drill.yml", "utf8");

    expect(restore).toContain("mktemp -d");
    expect(restore).toContain("Refusing to restore into the production data directory");
    expect(restore).toContain('${SCRIPT_DIR}/verify-backup.sh');
    expect(restore).toContain("PRAGMA integrity_check");
    expect(restore).toContain("/healthz");
    expect(restore).toContain("/version");
    expect(workflow).toContain('cron: "15 4 1 * *"');
    expect(workflow).toContain("scripts/restore-backup.sh");
    expect(workflow).toContain("--image");
    expect(workflow).toContain("RELEASE_APP_IMAGE");
    expect(workflow).toContain("RELEASE_COMMIT_SHA");
    expect(workflow).toContain("RELEASE_IMAGE_DIGEST");
    expect(workflow).toContain("RELEASE_SCHEMA_VERSION");
    expect(workflow).toContain('[[ "${APP_IMAGE##*@}" == "$IMAGE_DIGEST" ]]');
    expect(workflow).not.toContain("BUILD_SHA");
    expect(workflow).not.toContain("/var/www/arthurs-review/data:/data");
  });

  it("serializes GitHub deploy and backup maintenance", () => {
    const deployWorkflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
    const backupWorkflow = fs.readFileSync(".github/workflows/backup.yml", "utf8");

    expect(deployWorkflow).toContain("group: production-maintenance");
    expect(backupWorkflow).toContain("group: production-maintenance");
  });

  it("requires the app to become healthy after every deployment mode", () => {
    const deploy = fs.readFileSync("scripts/remote-release.sh", "utf8");
    const health = fs.readFileSync("src/app/healthz/route.ts", "utf8");

    expect(deploy).toContain("verify_target_internal");
    expect(deploy).toContain("verify_target_public");
    expect(deploy).toContain("verify_previous_release");
    expect(deploy).toContain("verify_current_release_before_snapshot || return");
    expect(deploy.indexOf("verify_current_release_before_snapshot || return")).toBeLessThan(
      deploy.indexOf("production_compose stop app"),
    );
    expect(deploy).toContain("/healthz");
    expect(deploy).toContain("docker compose logs --tail=80 app");
    expect(health).toContain("await connection()");
  });

  it("installs the SQLite CLI through the VPS package manager", () => {
    const deploy = fs.readFileSync("scripts/remote-release.sh", "utf8");

    expect(deploy).toContain("command -v apt-get");
    expect(deploy).toContain("command -v apk");
    expect(deploy).toContain("command -v dnf");
    expect(deploy).toContain("command -v yum");
    expect(deploy).toContain("apk add --no-cache sqlite");
    expect(deploy).toContain("dnf install -y sqlite");
    expect(deploy).toContain("yum install -y sqlite");
  });

  it("always points production at the persistent article volume", () => {
    const compose = fs.readFileSync("deploy/docker-compose.yml", "utf8");

    expect(compose).toContain("DATA_DIR: /data");
    expect(compose).toContain("SITE_URL: https://blog.leesaitool.com");
  });

  it("declares the real HAProxy-to-Caddy topology without exposing the app", () => {
    const compose = fs.readFileSync("deploy/docker-compose.yml", "utf8");
    const haproxy = fs.readFileSync("deploy/haproxy.cfg", "utf8");
    const appSection = compose.slice(compose.indexOf("  app:"), compose.indexOf("  worker:"));
    const workerSection = compose.slice(compose.indexOf("  worker:"), compose.indexOf("  caddy:"));
    const caddySection = compose.slice(compose.indexOf("  caddy:"), compose.indexOf("\nvolumes:"));

    expect(appSection).not.toContain("ports:");
    expect(workerSection).not.toContain("ports:");
    expect(caddySection).toContain('- "127.0.0.1:8444:443"');
    expect(caddySection).toContain(
      "caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648",
    );
    expect(haproxy).toContain("bind *:80");
    expect(haproxy).toContain("bind *:443");
    expect(haproxy).toContain("acl sni_blog req.ssl_sni -i blog.leesaitool.com");
    expect(haproxy).toContain("acl sni_studio req.ssl_sni -i studio.blog.leesaitool.com");
    expect(haproxy).toContain("http-request redirect scheme https code 308");
    expect(haproxy).toContain("server caddy_https 127.0.0.1:8444 send-proxy-v2 check");
    expect(haproxy).toContain("server xray_reality 127.0.0.1:9443 check");
    expect(haproxy).toContain("default_backend xray_reality");
    expect(fs.readFileSync("scripts/server-bootstrap.sh", "utf8")).toContain("util-linux haproxy");
  });

  it("keeps the 2443 Xray service read-only across topology checks and deployments", () => {
    expect(fs.existsSync("scripts/production-topology-preflight.sh")).toBe(true);
    expect(fs.existsSync("deploy/README.md")).toBe(true);

    const preflight = fs.readFileSync("scripts/production-topology-preflight.sh", "utf8");
    const deploy = fs.readFileSync("scripts/deploy.sh", "utf8");
    const remoteRelease = fs.readFileSync("scripts/remote-release.sh", "utf8");
    const scripts = [
      preflight,
      deploy,
      remoteRelease,
      fs.readFileSync("scripts/switch-xray-to-caddy.sh", "utf8"),
      fs.readFileSync("scripts/remote-switch-xray-caddy.sh", "utf8"),
    ].join("\n");

    expect(preflight).toContain("xray-test.service");
    expect(preflight).toContain("xray-443.service");
    expect(preflight).toContain("config-test-2443.json");
    expect(preflight).toContain("config-443.json");
    expect(preflight).toContain("sha256sum");
    expect(preflight).toContain('require_xray "${XRAY_2443_UNIT}" "${XRAY_2443_CONFIG}" 2443');
    expect(preflight).toContain('require_xray "${XRAY_9443_UNIT}" "${XRAY_9443_CONFIG}" 9443');
    expect(preflight).toContain("--expect-topology");
    expect(deploy).toContain("probe_external_xray");
    expect(remoteRelease).toContain("production-topology-preflight.sh");
    expect(remoteRelease).toContain("install-haproxy-config.sh");
    expect(remoteRelease).toContain("XRAY_FINGERPRINT");
    expect(scripts).not.toMatch(/systemctl\s+(?:stop|restart|disable|enable).*xray/i);
  });

  it("overwrites client IP headers with Caddy's direct peer address", () => {
    const caddy = fs.readFileSync("deploy/Caddyfile", "utf8");

    expect(caddy).toContain("proxy_protocol");
    expect(caddy).toContain("fallback_policy ignore");
    expect(caddy).toContain("header_up X-Forwarded-For {remote_host}");
    expect(caddy).toContain("header_up X-Real-IP {remote_host}");
    expect(caddy).not.toContain("trusted_proxies");
  });

  it("requires this Mac's trusted client certificate for every Studio route", () => {
    const caddy = fs.readFileSync("deploy/Caddyfile", "utf8");
    const compose = fs.readFileSync("deploy/docker-compose.yml", "utf8");
    const clientCa = fs.readFileSync("deploy/studio-client-ca.pem", "utf8");

    expect(caddy).toContain("studio.blog.leesaitool.com {");
    expect(caddy).toContain("mode require_and_verify");
    expect(caddy).toContain("trust_pool file");
    expect(caddy).toContain("pem_file /etc/caddy/pki/studio-client-ca.pem");
    expect(caddy).toContain("@studio path /studio /studio/*");
    expect(caddy).toContain("respond @studio 404");
    expect(compose).toContain("./studio-client-ca.pem:/etc/caddy/pki/studio-client-ca.pem:ro");
    expect(clientCa).toContain("BEGIN CERTIFICATE");
    expect(clientCa).not.toContain("PRIVATE KEY");
  });

  it("validates and rolls back HAProxy config reloads without touching Xray", () => {
    const installer = fs.readFileSync("scripts/install-haproxy-config.sh", "utf8");

    expect(installer).toContain('haproxy -c -f "${SOURCE}"');
    expect(installer).toContain("trap rollback ERR");
    expect(installer).toContain("systemctl reload haproxy.service");
    expect(installer).toContain("/healthz");
    expect(installer).not.toMatch(/systemctl .*xray/i);
  });

  it("runs a restartable worker from the exact same app image and data volume", () => {
    const compose = fs.readFileSync("deploy/docker-compose.yml", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

    expect(compose.match(/image: \$\{APP_IMAGE:\?APP_IMAGE must contain an immutable digest\}/g)).toHaveLength(2);
    expect(compose).not.toContain("build:");
    expect(compose).toContain("worker:");
    expect(compose).toContain('command: ["pnpm", "jobs:work"]');
    expect(compose.match(/\/var\/www\/arthurs-review\/data:\/data/g)).toHaveLength(2);
    expect(packageJson.scripts["jobs:work"]).toBe("tsx scripts/jobs-worker.ts");
  });

  it("runs the locked semantic models as an internal, resource-bounded service shared by app and worker", () => {
    const compose = fs.readFileSync("deploy/docker-compose.yml", "utf8");
    const semanticDockerfile = fs.readFileSync("semantic.Dockerfile", "utf8");
    const semanticSection = compose.slice(compose.indexOf("  semantic:"), compose.indexOf("  caddy:"));
    const appSection = compose.slice(compose.indexOf("  app:"), compose.indexOf("  worker:"));
    const workerSection = compose.slice(compose.indexOf("  worker:"), compose.indexOf("  semantic:"));

    expect(semanticSection).toContain("image: ${SEMANTIC_IMAGE:?SEMANTIC_IMAGE must contain an immutable digest}");
    expect(semanticSection).toContain('expose:\n      - "8090"');
    expect(semanticSection).not.toContain("ports:");
    expect(semanticSection).toContain("mem_limit:");
    expect(semanticSection).toContain("cpus:");
    expect(semanticSection).toContain("healthcheck:");
    for (const service of [appSection, workerSection]) {
      expect(service).toContain("SEMANTIC_SEARCH_URL: http://semantic:8090");
      expect(service).toContain("SEMANTIC_SEARCH_MODEL_ID: ibm-granite/granite-embedding-97m-multilingual-r2");
      expect(service).toContain("SEMANTIC_SEARCH_MODEL_REVISION: 835ad14087e140460703cf0fae09f97d469d65c2");
      expect(service).toContain("SEMANTIC_SEARCH_DIMENSION: 384");
      expect(service).toContain("SEMANTIC_RERANK_MODEL_ID: cross-encoder/mmarco-mMiniLMv2-L12-H384-v1");
      expect(service).toContain("SEMANTIC_RERANK_MODEL_REVISION: 1427fd652930e4ba29e8149678df786c240d8825");
      expect(service).toContain('SEMANTIC_RERANK_ENABLED: "${SEMANTIC_RERANK_ENABLED:-1}"');
    }
    expect(semanticSection).toContain('SEMANTIC_RERANK_ENABLED: "${SEMANTIC_RERANK_ENABLED:-1}"');
    expect(semanticDockerfile).toContain("semantic/models.lock.json");
    expect(semanticDockerfile).toContain("python download_models.py");
    expect(semanticDockerfile).toContain("USER semantic");
    expect(semanticDockerfile).toContain("HEALTHCHECK");
    expect(semanticDockerfile).not.toMatch(/(?:torch|transformers)/i);
  });

  it("provides the production site URL while Next.js metadata is built", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");
    const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");

    expect(dockerfile).toContain("ARG SITE_URL");
    expect(dockerfile).toContain("ENV SITE_URL=$SITE_URL");
    expect(workflow).toContain("SITE_URL=https://blog.leesaitool.com");
  });

  it("resolves the robots sitemap URL from the runtime environment", () => {
    const robots = fs.readFileSync("src/app/robots.ts", "utf8");

    expect(robots).toContain('import { connection } from "next/server"');
    expect(robots).toContain("await connection()");
  });

  it("adds admin credentials from dedicated GitHub secrets", () => {
    const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");

    expect(workflow).toContain("ADMIN_PASSWORD_HASH: ${{ secrets.ADMIN_PASSWORD_HASH }}");
    expect(workflow).toContain("SESSION_SECRET: ${{ secrets.SESSION_SECRET }}");
    expect(workflow).toContain("printf 'ADMIN_PASSWORD_HASH=%s\\n' \"$ADMIN_PASSWORD_HASH\"");
    expect(workflow).toContain("printf 'SESSION_SECRET=%s\\n' \"$SESSION_SECRET\"");
  });

  it("makes pnpm native-build policy available during the Docker install", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");
    const policyCopy = dockerfile.indexOf("COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./");
    const install = dockerfile.indexOf("RUN pnpm install --frozen-lockfile");

    expect(policyCopy).toBeGreaterThanOrEqual(0);
    expect(policyCopy).toBeLessThan(install);
  });

  it("ships the pinned pnpm runtime in the image without network fallback", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");
    const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");

    expect(dockerfile.match(/corepack install --global pnpm@10\.28\.1/g)).toHaveLength(3); // deps, builder, runner (libvips stage needs no pnpm)    expect(dockerfile).toContain("ENV COREPACK_ENABLE_NETWORK=0");
    expect(workflow).toContain('docker run --rm --network none "$IMAGE_TAG" pnpm --version');
  });

  it("uses Node 26 everywhere", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");
    const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as { engines?: { node?: string } };

    expect(dockerfile.match(/FROM node:26-alpine/g)).toHaveLength(4); // deps, builder, libvips, runner
    expect(workflow).toContain("node-version: 26");
    expect(packageJson.engines?.node).toBe(">=26 <27");
    expect(fs.readFileSync(".nvmrc", "utf8").trim()).toBe("26");
    expect(fs.readFileSync(".node-version", "utf8").trim()).toBe("26");
  });

  it("builds SHA-tagged app and semantic images, tests both, and only then pushes them", () => {
    const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");
    const playwright = fs.readFileSync("playwright.config.ts", "utf8");
    const build = workflow.indexOf("docker/build-push-action@v7");
    const e2e = workflow.indexOf("pnpm exec playwright test");
    const push = workflow.indexOf('docker push "$IMAGE_TAG"');

    expect(workflow).toContain("packages: write");
    expect(workflow.match(/docker\/build-push-action@v7/g)).toHaveLength(2);
    expect(workflow).toContain("load: true");
    expect(workflow).toContain("GIT_COMMIT_SHA=${{ github.sha }}");
    expect(workflow).toContain("${{ github.sha }}");
    expect(workflow).toContain(
      `docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'`,
    );
    expect(workflow).toContain("pnpm exec playwright install --with-deps chromium");
    expect(workflow).toContain('"$IMAGE_TAG" pnpm jobs:work');
    expect(workflow).toContain('docker network create "$E2E_NETWORK"');
    expect(workflow).toContain("SEMANTIC_IMAGE_TAG");
    expect(workflow).toContain("semantic.Dockerfile");
    expect(workflow).toContain('docker push "$SEMANTIC_IMAGE_TAG"');
    expect(workflow).toContain("SEMANTIC_IMAGE_DIGEST");
    expect(workflow).toContain("http://semantic:8090/healthz");
    expect(workflow).toContain("pending_cache_jobs");
    expect(workflow).toContain("EXPECTED_SCHEMA_VERSION");
    expect(workflow).toContain("type = ? and status in (?, ?)");
    expect(workflow).not.toContain("run: pnpm build");
    expect(build).toBeGreaterThanOrEqual(0);
    expect(build).toBeLessThan(e2e);
    expect(e2e).toBeLessThan(push);
    expect(dockerfile.match(/FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66/g)).toHaveLength(4);
    expect(playwright).toContain("process.env.PLAYWRIGHT_BASE_URL");
    expect(playwright).toContain("webServer: externalBaseURL ? undefined");
    expect(playwright).toContain("workers: 1");
  });

  it("installs Corepack explicitly because Node 26 no longer bundles it", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");

    expect(dockerfile.match(/npm install --global corepack@0\.35\.0/g)).toHaveLength(3);
    expect(dockerfile.match(/corepack enable/g)).toHaveLength(3);
  });

  it("sets production security headers and removes framework branding", () => {
    const caddy = fs.readFileSync("deploy/Caddyfile", "utf8");
    const compose = fs.readFileSync("deploy/docker-compose.yml", "utf8");
    const deploy = fs.readFileSync("scripts/remote-release.sh", "utf8");
    const nextConfig = fs.readFileSync("next.config.ts", "utf8");

    expect(caddy).toContain("Strict-Transport-Security");
    expect(caddy).toContain("X-Content-Type-Options nosniff");
    expect(caddy).toContain("Referrer-Policy strict-origin-when-cross-origin");
    expect(caddy).toContain("Content-Security-Policy");
    expect(caddy).toContain("frame-ancestors 'none'");
    expect(caddy).toContain("Permissions-Policy");
    expect(caddy).toContain("header_down -X-Powered-By");
    expect(deploy).toContain("caddy validate");
    expect(deploy).toContain("caddy reload");
    expect(deploy).toContain("PUBLIC_URL");
    expect(deploy).toContain("strict-transport-security:");
    expect(deploy).toContain("x-content-type-options:");
    expect(deploy).toContain("referrer-policy:");
    expect(deploy).toContain("content-security-policy:");
    expect(deploy).toContain("permissions-policy:");
    expect(deploy).toContain("x-powered-by:");
    expect(nextConfig).toContain("poweredByHeader: false");
    expect(nextConfig).toContain('key: "Strict-Transport-Security"');
    expect(nextConfig).toContain('key: "X-Content-Type-Options"');
    expect(nextConfig).toContain('key: "Referrer-Policy"');
    expect(nextConfig).toContain('key: "Content-Security-Policy"');
    expect(nextConfig).toContain("frame-ancestors 'none'");
    expect(nextConfig).toContain("base-uri 'self'");
    expect(nextConfig).toContain("object-src 'none'");
    expect(nextConfig).toContain('key: "Permissions-Policy"');
    expect(nextConfig).toContain("camera=()");
    expect(nextConfig).toContain("microphone=()");
    expect(nextConfig).toContain("geolocation=()");
    expect(compose).toContain("caddy_logs:/var/log/caddy");
  });

  it("writes bounded JSON access logs without enabling credential logging", () => {
    const caddy = fs.readFileSync("deploy/Caddyfile", "utf8");

    expect(caddy).toContain("log {");
    expect(caddy).toContain("output file /var/log/caddy/access.log");
    expect(caddy).toContain("roll_size 25MiB");
    expect(caddy).toContain("roll_interval 24h");
    expect(caddy).toContain("roll_keep 30");
    expect(caddy).toContain("roll_keep_for 720h");
    expect(caddy).toContain("format json");
    expect(caddy).not.toContain("log_credentials");
  });

  it("rejects moving image tags and accepts one exact digest", () => {
    const moving = validateReleaseInputs("ghcr.io/arthurlee116/arthurs-review-main:main");
    const immutable = validateReleaseInputs(`ghcr.io/arthurlee116/arthurs-review-main@sha256:${"b".repeat(64)}`);
    const movingSemantic = validateReleaseInputs(
      `ghcr.io/arthurlee116/arthurs-review-main@sha256:${"b".repeat(64)}`,
      "ghcr.io/arthurlee116/arthurs-review-main-semantic:main",
    );

    expect(moving.status).not.toBe(0);
    expect(movingSemantic.status).not.toBe(0);
    expect(immutable.status, immutable.stderr).toBe(0);
  });

  it("runs one forward transaction and starts the worker only after public version verification", () => {
    const result = runReleaseHarness();

    expect(result.status, result.stderr).toBe(0);
    expect(result.events).toEqual([
      "prepare",
      "snapshot",
      "install",
      "migrate",
      "app",
      "internal",
      "proxy",
      "version",
      "worker",
      "finalize",
    ]);
  });

  it.each([
    ["migrate", ["prepare", "snapshot", "install", "migrate", "rollback"]],
    ["internal", ["prepare", "snapshot", "install", "migrate", "app", "internal", "rollback"]],
    ["version", ["prepare", "snapshot", "install", "migrate", "app", "internal", "proxy", "version", "rollback"]],
  ])("rolls back when %s fails", (failAt, expectedEvents) => {
    const result = runReleaseHarness({ failAt });

    expect(result.status).not.toBe(0);
    expect(result.events).toEqual(expectedEvents);
    expect(result.events).not.toContain("worker");
    expect(result.events).not.toContain("finalize");
  });

  it("returns an unmistakable failure when rollback also fails", () => {
    const result = runReleaseHarness({ failAt: "internal", rollbackFails: true });

    expect(result.status).toBe(70);
    expect(result.events.at(-1)).toBe("rollback");
  });

  it("restores the current release when a manual rollback snapshot fails", () => {
    const result = runManualRollbackHarness({ snapshotFails: true });

    expect(result.status).not.toBe(0);
    expect(result.events).toEqual(["pull", "snapshot", "rollback"]);
  });

  it("restores the current release when manual rollback state cannot be committed", () => {
    const result = runManualRollbackHarness({ stateWriteFails: true });

    expect(result.status).not.toBe(0);
    expect(result.events.at(-1)).toBe("rollback");
  });

  it("does not stop the current app when the candidate never mutated production", () => {
    const result = runUnmutatedRollbackHarness();

    expect(result.status).toBe(0);
    expect(result.events).toEqual([]);
  });

  it("pulls with an ephemeral registry token, verifies metadata, and records atomic release state", () => {
    const deploy = fs.readFileSync("scripts/deploy.sh", "utf8");
    const remoteRelease = fs.readFileSync("scripts/remote-release.sh", "utf8");

    expect(deploy).toContain('deploy/ "${REMOTE}:${STAGING_DIR}/deploy/"');
    expect(deploy).toContain('scripts/ "${REMOTE}:${STAGING_DIR}/scripts/"');
    expect(deploy).not.toContain('./ "${REMOTE}:${APP_DIR}/"');
    expect(deploy).toContain('printf \'%s\' "${REGISTRY_TOKEN}"');
    expect(remoteRelease).toContain("docker login ghcr.io");
    expect(remoteRelease).toContain("--password-stdin");
    expect(remoteRelease.indexOf("docker login ghcr.io")).toBeLessThan(remoteRelease.indexOf('docker pull "${APP_IMAGE}"'));
    expect(remoteRelease.indexOf('docker pull "${APP_IMAGE}"')).toBeLessThan(remoteRelease.indexOf("docker logout ghcr.io"));
    expect(remoteRelease).toContain('docker pull "${SEMANTIC_IMAGE}"');
    expect(remoteRelease).toContain("org.opencontainers.image.revision");
    expect(remoteRelease).toContain("current-release.env");
    expect(remoteRelease).toContain("previous-release.env");
    expect(remoteRelease).toContain("DATABASE_SNAPSHOT");
    expect(remoteRelease).toContain("CONFIG_SNAPSHOT");
    expect(remoteRelease).toContain("/version");
    expect(remoteRelease).toContain('"commit":"${DEPLOY_COMMIT_SHA}"');
    expect(remoteRelease).toContain('"digest":"${IMAGE_DIGEST}"');
    expect(remoteRelease).toContain('"schemaVersion":${EXPECTED_SCHEMA_VERSION}');
  });

  it("runs feature-branch CI without production deployment permissions", () => {
    const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches-ignore:");
    expect(workflow).toContain("pnpm lint");
    expect(workflow).toContain("pnpm test");
    expect(workflow).toContain('"./semantic[test]"');
    expect(workflow).toContain("python -m pytest semantic/tests");
    expect(workflow).not.toContain("unittest discover");
    expect(workflow.match(/docker\/build-push-action@v7/g)).toHaveLength(2);
    expect(workflow).toContain("semantic.Dockerfile");
    expect(workflow).toContain('"http://127.0.0.1:8090/embed"');
    expect(workflow).toContain('"dimension": 384');
    expect(workflow).toContain("pnpm exec playwright test");
    expect(workflow).not.toContain("packages: write");
    expect(workflow).not.toContain("scripts/deploy.sh");
    expect(workflow).not.toContain("DEPLOY_SSH_PRIVATE_KEY");
  });

  it("can recover the legacy app-only deployment without depending on legacy helper scripts", () => {
    const remoteRelease = fs.readFileSync("scripts/remote-release.sh", "utf8");
    const recoveredProxy = remoteRelease.slice(
      remoteRelease.indexOf("activate_recovered_proxy()"),
      remoteRelease.indexOf("verify_previous_release()"),
    );
    const rollback = remoteRelease.slice(
      remoteRelease.indexOf("rollback_candidate()"),
      remoteRelease.indexOf("run_forward_release()"),
    );

    expect(recoveredProxy).toContain("install_recovered_haproxy");
    expect(recoveredProxy).not.toContain("/scripts/install-haproxy-config.sh");
    expect(rollback).toContain("production_compose stop worker");
    expect(rollback).toContain("production_compose stop app");
    expect(rollback).not.toContain("production_compose stop app worker");
  });

  it("starts the image without hidden migrations and offers a previous-release-only manual rollback", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");
    const rollbackWorkflow = fs.readFileSync(".github/workflows/rollback.yml", "utf8");

    expect(dockerfile).toContain('CMD ["pnpm", "start"]');
    expect(dockerfile).not.toContain("pnpm db:migrate && pnpm start");
    expect(rollbackWorkflow).toContain("workflow_dispatch:");
    expect(rollbackWorkflow).toContain('ROLLBACK_ONLY: "1"');
    expect(rollbackWorkflow).toContain("./scripts/deploy.sh");
    expect(rollbackWorkflow).toContain("previous-release.env");
  });

  it("marks protected database-backed pages as intentionally blocking", () => {
    for (const page of [
      "src/app/studio/(protected)/articles/page.tsx",
      "src/app/studio/(protected)/articles/new/page.tsx",
      "src/app/studio/(protected)/articles/[id]/page.tsx",
      "src/app/studio/(protected)/preview/[id]/page.tsx",
      "src/app/studio/(protected)/settings/page.tsx",
      "src/app/studio/(protected)/tags/page.tsx",
    ]) {
      expect(fs.readFileSync(page, "utf8")).toContain("export const instant = false");
    }
  });
});
