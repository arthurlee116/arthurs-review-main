import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ensureDataDirectories } from "@/lib/env";
import { newUploadPath, uploadDiskPath } from "./paths";

const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "image/avif"]);

const MAX_PIXELS = 12_000_000;
const MAX_EDGE = 1600;

export async function processImageUpload(buffer: Buffer, originalName: string, mimeType = "image/jpeg") {
  if (!allowed.has(mimeType)) throw new Error("Only JPEG, PNG, WebP, HEIC, GIF, and AVIF images are allowed.");
  if (buffer.length > 8 * 1024 * 1024) throw new Error("Image must be 8 MB or smaller.");

  ensureDataDirectories();
  // sharp flattens animated GIFs to a static frame, so keep GIFs untouched
  const extension = mimeType === "image/gif" ? "gif" : "webp";
  const relativePath = newUploadPath(extension);
  const diskPath = uploadDiskPath(relativePath);
  fs.mkdirSync(path.dirname(diskPath), { recursive: true });

  if (extension === "gif") {
    fs.writeFileSync(diskPath, buffer);
    const metadata = await sharp(buffer).metadata();
    return { relativePath, width: metadata.width ?? 0, height: metadata.height ?? 0, originalName };
  }

  const input = sharp(buffer, { limitInputPixels: MAX_PIXELS * 8 });
  const metadata = await input.metadata();
  const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
  const scale = pixels > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / pixels) : 1;

  const output = await input
    .rotate()
    .resize({
      width: Math.max(1, Math.round((metadata.width ?? MAX_EDGE) * scale)),
      height: Math.max(1, Math.round((metadata.height ?? MAX_EDGE) * scale)),
      fit: "inside",
      withoutEnlargement: true,
    })
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(diskPath);

  return {
    relativePath,
    width: output.width,
    height: output.height,
    originalName,
  };
}
