import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/healthz/route";
import { closeDb } from "@/lib/db/connection";

const originalDataDir = process.env.DATA_DIR;

afterEach(() => {
  closeDb();
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /healthz", () => {
  it("checks both SQLite and writable persistent storage", async () => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "myblog-health-"));
    const { migrate } = await import("@/lib/db/migrate");
    migrate();

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checks: { database: "ok", storage: "ok", release: "ok" },
    });
  });

  it("fails when the deployed commit does not match the image commit", async () => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "myblog-health-release-"));
    const { migrate } = await import("@/lib/db/migrate");
    migrate();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BUILD_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    vi.stubEnv("DEPLOY_COMMIT_SHA", "89abcdef0123456789abcdef0123456789abcdef");
    vi.stubEnv("IMAGE_DIGEST", `sha256:${"ab".repeat(32)}`);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      checks: { database: "ok", storage: "ok", release: "failed" },
    });
  });

  it("fails when SQLite opens but the application schema is unavailable", async () => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "myblog-health-schema-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      checks: { database: "failed", storage: "ok", release: "ok" },
    });
  });

  it("returns 503 without leaking internals when storage cannot initialize", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "myblog-health-bad-"));
    const dataFile = path.join(root, "not-a-directory");
    fs.writeFileSync(dataFile, "occupied");
    process.env.DATA_DIR = dataFile;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      checks: { database: "failed", storage: "failed", release: "ok" },
    });
  });
});
