import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;

function writeFixture(relativePath: string, contents: string) {
  const diskPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(diskPath), { recursive: true });
  fs.writeFileSync(diskPath, contents);
}

async function callGet(segments: string[]) {
  const { GET } = await import("@/app/media/[...path]/route");
  const request = new Request(`http://localhost:3000/media/${segments.join("/")}`);
  return GET(request as never, { params: Promise.resolve({ path: segments }) });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-review-media-route-"));
  process.env.DATA_DIR = tmpDir;
  process.env.SITE_URL = "http://localhost:3000";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
  process.env.SESSION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET /media/[...path]", () => {
  it("serves .mp4 files with video/mp4 content type", async () => {
    writeFixture("uploads/2026/07/clip.mp4", "fake-video-bytes");

    const response = await callGet(["2026", "07", "clip.mp4"]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("fake-video-bytes");
  });

  it("serves .webp files with image/webp content type", async () => {
    writeFixture("uploads/2026/07/cover.webp", "fake-image-bytes");

    const response = await callGet(["2026", "07", "cover.webp"]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("fake-image-bytes");
  });

  it("returns 404 for unknown extensions even when the file exists", async () => {
    writeFixture("uploads/2026/07/evil.exe", "MZ");

    const response = await callGet(["2026", "07", "evil.exe"]);

    expect(response.status).toBe(404);
  });

  it("returns 404 for missing files", async () => {
    const response = await callGet(["2026", "07", "missing.mp4"]);

    expect(response.status).toBe(404);
  });
});
