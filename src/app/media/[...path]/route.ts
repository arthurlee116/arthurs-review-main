import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { uploadDiskPath } from "@/lib/media/paths";

const MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  const relative = `uploads/${params.path.join("/")}`;
  const diskPath = uploadDiskPath(relative);

  const contentType = MIME_TYPES[path.extname(diskPath).toLowerCase()];
  if (!contentType || !fs.existsSync(diskPath)) {
    return new Response("Not found", { status: 404 });
  }

  const body = Readable.toWeb(fs.createReadStream(diskPath)) as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
