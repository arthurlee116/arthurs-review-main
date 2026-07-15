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
});

describe("GET /healthz", () => {
  it("checks both SQLite and writable persistent storage", async () => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "myblog-health-"));

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checks: { database: "ok", storage: "ok" },
    });
  });

  it("returns 503 without leaking internals when storage cannot initialize", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "myblog-health-bad-"));
    const dataFile = path.join(root, "not-a-directory");
    fs.writeFileSync(dataFile, "occupied");
    process.env.DATA_DIR = dataFile;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      checks: { database: "failed", storage: "failed" },
    });
  });
});
