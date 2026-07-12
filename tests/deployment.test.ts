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

  it("makes pnpm native-build policy available during the Docker install", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");
    const policyCopy = dockerfile.indexOf("COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./");
    const install = dockerfile.indexOf("RUN pnpm install --frozen-lockfile");

    expect(policyCopy).toBeGreaterThanOrEqual(0);
    expect(policyCopy).toBeLessThan(install);
  });
});
