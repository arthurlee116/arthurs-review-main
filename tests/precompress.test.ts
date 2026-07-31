import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { precompressImage } from "@/lib/studio/precompress";

function fakeImageFile(name = "photo.jpg", type = "image/jpeg") {
  return new File(["fake-image-bytes"], name, { type });
}

type DrawCall = { width: number; height: number };

function mockCanvas(drawCalls: DrawCall[]) {
  const context = { drawImage: vi.fn((_bitmap: unknown, _x: number, _y: number, w: number, h: number) => {
    drawCalls.push({ width: w, height: h });
  }) };
  vi.stubGlobal(
    "ImageBitmap",
    class {},
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback, type?: string, quality?: number) {
    void this;
    void quality;
    callback(new Blob(["compressed"], { type: type ?? "image/png" }));
  });
}

describe("precompressImage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 8000, height: 6000, close: vi.fn() })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downscales an oversized image to 1600px max edge and encodes webp", async () => {
    const drawCalls: DrawCall[] = [];
    mockCanvas(drawCalls);
    const result = await precompressImage(fakeImageFile());
    expect(result.type).toBe("image/webp");
    expect(result.name).toMatch(/\.webp$/);
    expect(drawCalls).toEqual([{ width: 1600, height: 1200 }]);
  });

  it("keeps aspect ratio for portrait images", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 3000, height: 4000, close: vi.fn() })),
    );
    const drawCalls: DrawCall[] = [];
    mockCanvas(drawCalls);
    await precompressImage(fakeImageFile());
    expect(drawCalls).toEqual([{ width: 1200, height: 1600 }]);
  });

  it("passes imageOrientation through to createImageBitmap", async () => {
    mockCanvas([]);
    await precompressImage(fakeImageFile());
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
  });

  it("returns video files untouched", async () => {
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    const result = await precompressImage(file);
    expect(result).toBe(file);
  });

  it("returns the original file when createImageBitmap is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const file = fakeImageFile();
    const result = await precompressImage(file);
    expect(result).toBe(file);
  });
});
