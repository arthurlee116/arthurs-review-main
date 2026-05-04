import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-media-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "http://localhost:3000";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
  process.env.SESSION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db/connection");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("image uploads", () => {
  it("stores an optimized web image below the uploads directory", async () => {
    const { processImageUpload } = await import("@/lib/media/image");
    const input = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 3,
        background: "#111111",
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processImageUpload(input, "cover.jpg");

    expect(result.relativePath.startsWith("uploads/")).toBe(true);
    expect(result.relativePath.endsWith(".webp")).toBe(true);
    expect(result.width).toBeLessThanOrEqual(1600);
  });
});
