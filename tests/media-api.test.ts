import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/api/_helpers", () => ({
  requireApiAdmin: vi.fn(async () => null),
}));

describe("media API", () => {
  it("returns a clear 400 JSON response for invalid image uploads", async () => {
    process.env.DATA_DIR = "./data/test-media-api";
    process.env.SITE_URL = "http://localhost:3000";
    process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
    process.env.SESSION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
    const { POST } = await import("@/app/studio/api/media/route");
    const body = new FormData();
    body.append("file", new File(["not an image"], "notes.txt", { type: "text/plain" }));

    const response = await POST({
      method: "POST",
      formData: async () => body,
    } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only JPEG, PNG, and WebP images are allowed.",
    });
  });
});
