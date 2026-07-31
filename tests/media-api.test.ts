import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/api/_helpers", () => ({
  requireApiAdmin: vi.fn(async () => null),
}));

vi.mock("@/lib/media/video", () => ({
  processVideoUpload: vi.fn(async (buffer: Buffer, originalName: string) => ({
    relativePath: "uploads/2026/07/video-uuid.mp4",
    coverRelativePath: "uploads/2026/07/cover-uuid.webp",
    width: 1280,
    height: 720,
    durationSeconds: 2.01,
    originalName,
  })),
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-media-api-"));
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

describe("media API", () => {
  it("returns a clear 400 JSON response for invalid image uploads", async () => {
    const { POST } = await import("@/app/studio/api/media/route");
    const body = new FormData();
    body.append("file", new File(["not an image"], "notes.txt", { type: "text/plain" }));

    const response = await POST({
      method: "POST",
      formData: async () => body,
    } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only images and videos are allowed.",
    });
  });

  it("accepts image uploads with kind image and existing fields", async () => {
    const { POST } = await import("@/app/studio/api/media/route");
    const input = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: "#111111",
      },
    })
      .jpeg()
      .toBuffer();
    const body = new FormData();
    body.append("file", new File([input], "cover.jpg", { type: "image/jpeg" }));

    const response = await POST({
      method: "POST",
      formData: async () => body,
    } as Request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.kind).toBe("image");
    expect(json.relativePath.startsWith("uploads/")).toBe(true);
    expect(json.relativePath.endsWith(".webp")).toBe(true);
    expect(json.publicPath.startsWith("/media/")).toBe(true);
    expect(json.width).toBeGreaterThan(0);
    expect(json.height).toBeGreaterThan(0);
    expect(json.originalName).toBe("cover.jpg");
  });

  it("accepts video uploads with kind video and coverPublicPath", async () => {
    const { POST } = await import("@/app/studio/api/media/route");
    const body = new FormData();
    body.append("file", new File(["fake video bytes"], "clip.mp4", { type: "video/mp4" }));

    const response = await POST({
      method: "POST",
      formData: async () => body,
    } as Request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.kind).toBe("video");
    expect(json.relativePath).toBe("uploads/2026/07/video-uuid.mp4");
    expect(json.publicPath).toBe("/media/2026/07/video-uuid.mp4");
    expect(json.coverRelativePath).toBe("uploads/2026/07/cover-uuid.webp");
    expect(json.coverPublicPath).toBe("/media/2026/07/cover-uuid.webp");
    expect(json.width).toBe(1280);
    expect(json.height).toBe(720);
    expect(json.durationSeconds).toBe(2.01);
    expect(json.originalName).toBe("clip.mp4");

    const { processVideoUpload } = await import("@/lib/media/video");
    expect(processVideoUpload).toHaveBeenCalledWith(expect.any(Buffer), "clip.mp4", "video/mp4");
  });

  it("returns 400 when the video processor rejects the upload", async () => {
    const { processVideoUpload } = await import("@/lib/media/video");
    vi.mocked(processVideoUpload).mockRejectedValueOnce(new Error("Only MP4, MOV, and WebM videos are allowed."));
    const { POST } = await import("@/app/studio/api/media/route");
    const body = new FormData();
    body.append("file", new File(["fake video bytes"], "clip.avi", { type: "video/x-msvideo" }));

    const response = await POST({
      method: "POST",
      formData: async () => body,
    } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only MP4, MOV, and WebM videos are allowed.",
    });
  });

  it("accepts HEIC uploads with empty MIME via extension fallback", async () => {
    const { POST } = await import("@/app/studio/api/media/route");
    const input = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#111111" },
    })
      .jpeg()
      .toBuffer();
    const body = new FormData();
    // iOS Safari often reports .heic files with an empty MIME type
    body.append("file", new File([input], "IMG_1234.HEIC", { type: "" }));

    const response = await POST({
      method: "POST",
      formData: async () => body,
    } as Request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.kind).toBe("image");
    expect(json.relativePath.endsWith(".webp")).toBe(true);
  });

  it("routes empty-MIME .mov files to the video processor", async () => {
    const { POST } = await import("@/app/studio/api/media/route");
    const body = new FormData();
    body.append("file", new File(["fake video bytes"], "clip.MOV", { type: "" }));

    const response = await POST({
      method: "POST",
      formData: async () => body,
    } as Request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.kind).toBe("video");

    const { processVideoUpload } = await import("@/lib/media/video");
    expect(processVideoUpload).toHaveBeenCalledWith(expect.any(Buffer), "clip.MOV", "video/quicktime");
  });

  it("rejects files with neither recognized MIME nor extension", async () => {
    const { POST } = await import("@/app/studio/api/media/route");
    const body = new FormData();
    body.append("file", new File(["scan bytes"], "scan.tiff", { type: "" }));

    const response = await POST({
      method: "POST",
      formData: async () => body,
    } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only images and videos are allowed.",
    });
  });
});
