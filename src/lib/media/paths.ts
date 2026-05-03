import crypto from "node:crypto";
import path from "node:path";
import { getDataPaths } from "@/lib/env";
import { safeDataPath } from "@/lib/content/markdown";

export function uploadPublicPath(relativePath: string) {
  return `/media/${relativePath.replace(/^uploads\//, "")}`;
}

export function uploadDiskPath(relativePath: string) {
  const paths = getDataPaths();
  return safeDataPath(paths.root, relativePath);
}

export function newUploadPath(extension: string) {
  const date = new Date();
  const folder = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const file = `${crypto.randomUUID()}.${extension}`;
  return path.posix.join("uploads", folder, file);
}
