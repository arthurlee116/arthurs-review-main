import fs from "node:fs";
import type { NextRequest } from "next/server";
import { uploadDiskPath } from "@/lib/media/paths";

export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  const relative = `uploads/${params.path.join("/")}`;
  const diskPath = uploadDiskPath(relative);

  if (!fs.existsSync(diskPath)) {
    return new Response("Not found", { status: 404 });
  }

  const body = fs.readFileSync(diskPath);
  return new Response(body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
