import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment scripts", () => {
  it("installs an automatic daily backup schedule during server bootstrap", () => {
    const bootstrap = fs.readFileSync("scripts/server-bootstrap.sh", "utf8");

    expect(bootstrap).toContain("arthurs-review-backup");
    expect(bootstrap).toContain("backup-data.sh");
    expect(bootstrap).toContain("/etc/cron.d");
  });

  it("requires the app to become healthy after every deployment mode", () => {
    const deploy = fs.readFileSync("scripts/deploy.sh", "utf8");
    const afterDeploymentBranch = deploy.slice(deploy.lastIndexOf("fi\n") + 3);

    expect(afterDeploymentBranch).toContain("/healthz");
    expect(afterDeploymentBranch).toContain("docker compose logs --tail=80 app");
  });

  it("always points production at the persistent article volume", () => {
    const compose = fs.readFileSync("deploy/docker-compose.yml", "utf8");

    expect(compose).toContain("DATA_DIR: /data");
    expect(compose).toContain("SITE_URL: https://blog.leesaitool.com");
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
});
