import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/version/route";
import { closeDb } from "@/lib/db/connection";
import { migrate } from "@/lib/db/migrate";

const commit = "0123456789abcdef0123456789abcdef01234567";
const digest = `sha256:${"ab".repeat(32)}`;

beforeEach(() => {
  vi.stubEnv("DATA_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "myblog-version-")));
  vi.stubEnv("BUILD_COMMIT_SHA", commit);
  vi.stubEnv("DEPLOY_COMMIT_SHA", commit);
  vi.stubEnv("IMAGE_DIGEST", digest);
  migrate();
});

afterEach(() => {
  closeDb();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /version", () => {
  it("returns immutable release identity and the applied schema version without caching", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ commit, digest, schemaVersion: 10 });
  });

  it("does not leak database details when the schema version is unavailable", async () => {
    closeDb();
    vi.stubEnv("DATA_DIR", fs.mkdtempSync(path.join(os.tmpdir(), "myblog-version-missing-")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Version metadata unavailable" });
  });

  it("embeds the same commit in the image environment and OCI label", () => {
    const dockerfile = fs.readFileSync("Dockerfile", "utf8");

    expect(dockerfile).toContain("ARG GIT_COMMIT_SHA");
    expect(dockerfile).toContain("ENV BUILD_COMMIT_SHA=$GIT_COMMIT_SHA");
    expect(dockerfile).toContain("LABEL org.opencontainers.image.revision=$GIT_COMMIT_SHA");
  });
});
