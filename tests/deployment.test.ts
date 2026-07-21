import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment scripts", () => {
  it("installs an automatic daily backup schedule during server bootstrap", () => {
    const bootstrap = fs.readFileSync("scripts/server-bootstrap.sh", "utf8");

    expect(bootstrap).toContain("arthurs-review-backup");
    expect(bootstrap).toContain("backup-data.sh");
    expect(bootstrap).toContain("/etc/cron.d");
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
    expect(workflow).toContain("-mmin -180");
    expect(workflow).not.toContain("backup-data.sh");
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
    for (const script of ["scripts/backup-data.sh", "scripts/deploy.sh", "scripts/restore-backup.sh"]) {
      const source = fs.readFileSync(script, "utf8");
      expect(source).toContain("/var/lock/arthurs-review-maintenance.lock");
      expect(source).toContain("flock");
    }

    const backup = fs.readFileSync("scripts/backup-data.sh", "utf8");
    const deploy = fs.readFileSync("scripts/deploy.sh", "utf8");
    const restore = fs.readFileSync("scripts/restore-backup.sh", "utf8");
    expect(backup.indexOf("exec flock")).toBeLessThan(backup.indexOf("docker compose stop app worker"));
    expect(deploy.indexOf("acquire_remote_maintenance_lock\n")).toBeLessThan(deploy.indexOf("rsync -az --delete"));
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
    expect(workflow).not.toContain("/var/www/arthurs-review/data:/data");
  });

  it("serializes GitHub deploy and backup maintenance", () => {
    const deployWorkflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
    const backupWorkflow = fs.readFileSync(".github/workflows/backup.yml", "utf8");

    expect(deployWorkflow).toContain("group: production-maintenance");
    expect(backupWorkflow).toContain("group: production-maintenance");
  });

  it("requires the app to become healthy after every deployment mode", () => {
    const deploy = fs.readFileSync("scripts/deploy.sh", "utf8");
    const health = fs.readFileSync("src/app/healthz/route.ts", "utf8");
    const commonDeploymentStart = deploy.indexOf("docker compose up -d caddy");
    const afterDeploymentBranch = deploy.slice(commonDeploymentStart);

    expect(commonDeploymentStart).toBeGreaterThanOrEqual(0);
    expect(afterDeploymentBranch).toContain("/healthz");
    expect(afterDeploymentBranch).toContain("docker compose logs --tail=80 app");
    expect(health).toContain("await connection()");
  });

  it("installs the SQLite CLI through the VPS package manager", () => {
    const deploy = fs.readFileSync("scripts/deploy.sh", "utf8");

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
    const scripts = [
      preflight,
      deploy,
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
    expect(deploy).toContain('${preflight_quoted} fingerprint');
    expect(deploy).toContain('${preflight_quoted} verify');
    expect(deploy).toContain("install-haproxy-config.sh");
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

    expect(compose.match(/image: arthurs-review-app:local/g)).toHaveLength(2);
    expect(compose).toContain("worker:");
    expect(compose).toContain('command: ["pnpm", "jobs:work"]');
    expect(compose.match(/\/var\/www\/arthurs-review\/data:\/data/g)).toHaveLength(2);
    expect(packageJson.scripts["jobs:work"]).toBe("tsx scripts/jobs-worker.ts");
  });

  it("provides the production site URL while Next.js metadata is built", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");
    const compose = fs.readFileSync("deploy/docker-compose.yml", "utf8");

    expect(dockerfile).toContain("ARG SITE_URL");
    expect(dockerfile).toContain("ENV SITE_URL=$SITE_URL");
    expect(compose).toContain("args:\n        SITE_URL: https://blog.leesaitool.com");
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

  it("uses Node 26 everywhere", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");
    const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8");
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as { engines?: { node?: string } };

    expect(dockerfile.match(/FROM node:26-alpine/g)).toHaveLength(3);
    expect(workflow).toContain("node-version: 26");
    expect(packageJson.engines?.node).toBe(">=26 <27");
    expect(fs.readFileSync(".nvmrc", "utf8").trim()).toBe("26");
    expect(fs.readFileSync(".node-version", "utf8").trim()).toBe("26");
  });

  it("installs Corepack explicitly because Node 26 no longer bundles it", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");

    expect(dockerfile.match(/npm install --global corepack@0\.35\.0/g)).toHaveLength(3);
    expect(dockerfile.match(/corepack enable/g)).toHaveLength(3);
  });

  it("sets production security headers and removes framework branding", () => {
    const caddy = fs.readFileSync("deploy/Caddyfile", "utf8");
    const compose = fs.readFileSync("deploy/docker-compose.yml", "utf8");
    const deploy = fs.readFileSync("scripts/deploy.sh", "utf8");
    const nextConfig = fs.readFileSync("next.config.ts", "utf8");
    const commonDeploymentStart = deploy.indexOf("docker compose up -d caddy");
    const afterDeploymentBranch = deploy.slice(commonDeploymentStart);

    expect(commonDeploymentStart).toBeGreaterThanOrEqual(0);
    expect(caddy).toContain("Strict-Transport-Security");
    expect(caddy).toContain("X-Content-Type-Options nosniff");
    expect(caddy).toContain("Referrer-Policy strict-origin-when-cross-origin");
    expect(caddy).toContain("Content-Security-Policy");
    expect(caddy).toContain("frame-ancestors 'none'");
    expect(caddy).toContain("Permissions-Policy");
    expect(caddy).toContain("header_down -X-Powered-By");
    expect(afterDeploymentBranch).toContain("caddy validate");
    expect(afterDeploymentBranch).toContain("caddy reload");
    expect(afterDeploymentBranch).toContain("PUBLIC_URL");
    expect(afterDeploymentBranch).toContain("strict-transport-security:");
    expect(afterDeploymentBranch).toContain("x-content-type-options:");
    expect(afterDeploymentBranch).toContain("referrer-policy:");
    expect(afterDeploymentBranch).toContain("content-security-policy:");
    expect(afterDeploymentBranch).toContain("permissions-policy:");
    expect(afterDeploymentBranch).toContain("x-powered-by:");
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
