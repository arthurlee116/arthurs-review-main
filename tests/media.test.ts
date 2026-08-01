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

  it("stores GIF uploads as-is without re-encoding", async () => {
    const { processImageUpload } = await import("@/lib/media/image");
    const { uploadDiskPath } = await import("@/lib/media/paths");
    const input = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ff0000" },
    })
      .gif()
      .toBuffer();

    const result = await processImageUpload(input, "anim.gif", "image/gif");

    expect(result.relativePath.endsWith(".gif")).toBe(true);
    expect(fs.readFileSync(uploadDiskPath(result.relativePath)).equals(input)).toBe(true);
  });

  it("accepts AVIF and compresses it to webp", async () => {
    const { processImageUpload } = await import("@/lib/media/image");
    const input = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#00ff00" },
    })
      .avif()
      .toBuffer();

    const result = await processImageUpload(input, "photo.avif", "image/avif");

    expect(result.relativePath.endsWith(".webp")).toBe(true);
    expect(result.width).toBeGreaterThan(0);
  });

  it("accepts HEIC mime type", async () => {
    const { processImageUpload } = await import("@/lib/media/image");
    // sharp's prebuilt libvips decodes HEIC but cannot encode it, so feed a real
    // decoded-capable buffer: use AVIF (same HEIF container family) renamed as heic
    const input = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#0000ff" },
    })
      .avif()
      .toBuffer();

    const result = await processImageUpload(input, "photo.heic", "image/heic");

    expect(result.relativePath.endsWith(".webp")).toBe(true);
  });

  it("rejects images above 12 megapixels", async () => {
    const { processImageUpload } = await import("@/lib/media/image");
    const input = await sharp({
      create: {
        width: 8000,
        height: 6000,
        channels: 3,
        background: "#111111",
      },
    })
      .jpeg()
      .toBuffer();

    await expect(processImageUpload(input, "huge.jpg")).rejects.toThrow(/too large.*12 MP/);
  });

  it("rejects unsupported image types like TIFF", async () => {
    const { processImageUpload } = await import("@/lib/media/image");

    await expect(processImageUpload(Buffer.from("fake"), "scan.tiff", "image/tiff")).rejects.toThrow(
      /JPEG, PNG, WebP, HEIC, GIF, and AVIF/,
    );
  });
});
