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
  });

  it("quiesces article writes while snapshotting SQLite and content files", () => {
    const backup = fs.readFileSync("scripts/backup-data.sh", "utf8");
    const stop = backup.indexOf("docker compose stop app");
    const snapshot = backup.indexOf("docker compose run --rm --no-deps app");
    const copy = backup.indexOf('for directory in markdown uploads proofs');
    const restart = backup.indexOf("docker compose up -d app");

    expect(stop).toBeGreaterThanOrEqual(0);
    expect(stop).toBeLessThan(snapshot);
    expect(snapshot).toBeLessThan(copy);
    expect(copy).toBeLessThan(restart);
    expect(backup).toContain("/healthz");
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
    const commonDeploymentStart = deploy.indexOf('ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose up -d caddy');
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
    const deploy = fs.readFileSync("scripts/deploy.sh", "utf8");
    const nextConfig = fs.readFileSync("next.config.ts", "utf8");
    const commonDeploymentStart = deploy.indexOf('ssh "${REMOTE}" "cd ${APP_DIR}/deploy && docker compose up -d caddy');
    const afterDeploymentBranch = deploy.slice(commonDeploymentStart);

    expect(commonDeploymentStart).toBeGreaterThanOrEqual(0);
    expect(caddy).toContain("Strict-Transport-Security");
    expect(caddy).toContain("X-Content-Type-Options nosniff");
    expect(caddy).toContain("Referrer-Policy strict-origin-when-cross-origin");
    expect(caddy).toContain("header_down -X-Powered-By");
    expect(afterDeploymentBranch).toContain("caddy validate");
    expect(afterDeploymentBranch).toContain("caddy reload");
    expect(afterDeploymentBranch).toContain("PUBLIC_URL");
    expect(afterDeploymentBranch).toContain("strict-transport-security:");
    expect(afterDeploymentBranch).toContain("x-content-type-options:");
    expect(afterDeploymentBranch).toContain("referrer-policy:");
    expect(afterDeploymentBranch).toContain("x-powered-by:");
    expect(nextConfig).toContain("poweredByHeader: false");
    expect(nextConfig).toContain('key: "Strict-Transport-Security"');
    expect(nextConfig).toContain('key: "X-Content-Type-Options"');
    expect(nextConfig).toContain('key: "Referrer-Policy"');
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
