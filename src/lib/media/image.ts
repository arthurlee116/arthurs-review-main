import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ensureDataDirectories } from "@/lib/env";
import { newUploadPath, uploadDiskPath } from "./paths";

const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "image/avif"]);

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

  const output = await sharp(buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(diskPath);

  return {
    relativePath,
    width: output.width,
    height: output.height,
    originalName,
  };
}
