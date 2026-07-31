import { requireApiAdmin } from "@/app/studio/api/_helpers";
import { processImageUpload } from "@/lib/media/image";
import { processVideoUpload } from "@/lib/media/video";
import { uploadPublicPath } from "@/lib/media/paths";

// iOS/Safari often reports .heic/.heif files with an empty MIME or
// application/octet-stream, so fall back to the extension
const EXTENSION_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

function resolveMimeType(file: File): string | null {
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) return file.type;
  const dot = file.name.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTENSION_MIME[file.name.slice(dot).toLowerCase()] ?? null;
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "File is required" }, { status: 400 });
  const mimeType = resolveMimeType(file);
  if (!mimeType) {
    return Response.json({ error: "Only images and videos are allowed." }, { status: 400 });
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (mimeType.startsWith("video/")) {
      const result = await processVideoUpload(buffer, file.name, mimeType);
      return Response.json({
        ...result,
        kind: "video",
        publicPath: uploadPublicPath(result.relativePath),
        coverPublicPath: uploadPublicPath(result.coverRelativePath),
      });
    }
    const result = await processImageUpload(buffer, file.name, mimeType);
    return Response.json({ ...result, kind: "image", publicPath: uploadPublicPath(result.relativePath) });
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
