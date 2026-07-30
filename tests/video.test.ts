import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

let tmpDir: string;
let clipPath: string;
let silentClipPath: string;

function generateClip(args: string[], target: string) {
  const result = spawnSync("ffmpeg", ["-y", ...args, target], { stdio: "ignore" });
  if (result.status !== 0) throw new Error("failed to generate test clip");
}

beforeAll(() => {
  if (!hasFfmpeg) return;
  const clipDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-clip-"));
  clipPath = path.join(clipDir, "clip.mp4");
  silentClipPath = path.join(clipDir, "silent.mp4");
  generateClip(
    [
      "-f", "lavfi", "-i", "testsrc=duration=2:size=640x360:rate=30",
      "-f", "lavfi", "-i", "sine",
      "-shortest",
      "-pix_fmt", "yuv420p",
    ],
    clipPath,
  );
  generateClip(
    [
      "-f", "lavfi", "-i", "testsrc=duration=2:size=640x360:rate=30",
      "-pix_fmt", "yuv420p",
    ],
    silentClipPath,
  );
});

afterAll(() => {
  if (!clipPath) return;
  fs.rmSync(path.dirname(clipPath), { recursive: true, force: true });
});

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-video-"));
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

describe("video uploads", () => {
  it.skipIf(!hasFfmpeg)(
    "transcodes to AV1 mp4 with a webp cover frame",
    async () => {
      const { processVideoUpload } = await import("@/lib/media/video");
      const buffer = fs.readFileSync(clipPath);

      const result = await processVideoUpload(buffer, "clip.mp4", "video/mp4");

      expect(result.relativePath.startsWith("uploads/")).toBe(true);
      expect(result.relativePath.endsWith(".mp4")).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, result.relativePath))).toBe(true);

      expect(result.coverRelativePath.startsWith("uploads/")).toBe(true);
      expect(result.coverRelativePath.endsWith(".webp")).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, result.coverRelativePath))).toBe(true);

      expect(result.durationSeconds).toBeGreaterThan(1.5);
      expect(result.durationSeconds).toBeLessThan(2.5);
      expect(result.width).toBeLessThanOrEqual(1920);
      expect(result.height).toBeGreaterThan(0);
      expect(result.originalName).toBe("clip.mp4");
    },
    120000,
  );

  it.skipIf(!hasFfmpeg)(
    "transcodes a clip without audio using the -an branch",
    async () => {
      const { processVideoUpload } = await import("@/lib/media/video");
      const buffer = fs.readFileSync(silentClipPath);

      const result = await processVideoUpload(buffer, "silent.mp4", "video/mp4");

      expect(result.relativePath.endsWith(".mp4")).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, result.relativePath))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, result.coverRelativePath))).toBe(true);
      expect(result.durationSeconds).toBeGreaterThan(1.5);
      expect(result.durationSeconds).toBeLessThan(2.5);
    },
    120000,
  );

  it.skipIf(!hasFfmpeg)(
    "cleans up partial outputs when ffmpeg fails on garbage input",
    async () => {
      const { processVideoUpload } = await import("@/lib/media/video");
      const garbage = Buffer.from("not a video");

      await expect(processVideoUpload(garbage, "garbage.mp4", "video/mp4")).rejects.toThrow(
        /Video processing failed:/,
      );

      const uploadsDir = path.join(tmpDir, "uploads");
      const leftovers = fs.existsSync(uploadsDir)
        ? fs.readdirSync(uploadsDir, { recursive: true }).filter((entry) => {
            const full = path.join(uploadsDir, String(entry));
            return fs.statSync(full).isFile();
          })
        : [];
      expect(leftovers).toEqual([]);
    },
    120000,
  );

  it("rejects unsupported MIME types", async () => {
    const { processVideoUpload } = await import("@/lib/media/video");
    await expect(processVideoUpload(Buffer.from("x"), "clip.avi", "video/x-msvideo")).rejects.toThrow(
      "Only MP4, MOV, and WebM videos are allowed.",
    );
  });

  it("rejects videos over 200 MB", async () => {
    const { processVideoUpload, MAX_VIDEO_BYTES } = await import("@/lib/media/video");
    const fake = Object.create(Buffer.prototype, { length: { value: MAX_VIDEO_BYTES + 1 } });
    await expect(processVideoUpload(fake, "big.mp4", "video/mp4")).rejects.toThrow(
      "Video must be 200 MB or smaller.",
    );
  });
});
