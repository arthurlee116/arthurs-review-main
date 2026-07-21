import { afterEach, describe, expect, it } from "vitest";
import { getDataPaths, getReleaseMetadata } from "@/lib/env";

const previousPasswordHash = process.env.ADMIN_PASSWORD_HASH;
const previousSessionSecret = process.env.SESSION_SECRET;
const previousBuildCommit = process.env.BUILD_COMMIT_SHA;
const previousDeployCommit = process.env.DEPLOY_COMMIT_SHA;
const previousImageDigest = process.env.IMAGE_DIGEST;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("ADMIN_PASSWORD_HASH", previousPasswordHash);
  restoreEnv("SESSION_SECRET", previousSessionSecret);
  restoreEnv("BUILD_COMMIT_SHA", previousBuildCommit);
  restoreEnv("DEPLOY_COMMIT_SHA", previousDeployCommit);
  restoreEnv("IMAGE_DIGEST", previousImageDigest);
});

describe("public data paths", () => {
  it("do not require private admin credentials during prerendering", () => {
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.SESSION_SECRET;

    expect(getDataPaths().dbPath).toContain("arthurs-review.sqlite3");
  });
});

describe("release metadata", () => {
  it("accepts matching full commit SHAs and an OCI digest", () => {
    const commit = "0123456789abcdef0123456789abcdef01234567";
    process.env.BUILD_COMMIT_SHA = commit;
    process.env.DEPLOY_COMMIT_SHA = commit;
    process.env.IMAGE_DIGEST = `sha256:${"ab".repeat(32)}`;

    expect(getReleaseMetadata().valid).toBe(true);
  });

  it("rejects moving tags, abbreviated SHAs, and mismatched commits", () => {
    process.env.BUILD_COMMIT_SHA = "0123456";
    process.env.DEPLOY_COMMIT_SHA = "89abcdef0123456789abcdef0123456789abcdef";
    process.env.IMAGE_DIGEST = "latest";

    expect(getReleaseMetadata().valid).toBe(false);
  });
});
