import { requireApiAdmin } from "@/app/studio/api/_helpers";
import { processImageUpload } from "@/lib/media/image";
import { processVideoUpload } from "@/lib/media/video";
import { uploadPublicPath } from "@/lib/media/paths";

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "File is required" }, { status: 400 });
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return Response.json({ error: "Only images and videos are allowed." }, { status: 400 });
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (file.type.startsWith("video/")) {
      const result = await processVideoUpload(buffer, file.name, file.type);
      return Response.json({
        ...result,
        kind: "video",
        publicPath: uploadPublicPath(result.relativePath),
        coverPublicPath: uploadPublicPath(result.coverRelativePath),
      });
    }
    const result = await processImageUpload(buffer, file.name, file.type);
    return Response.json({ ...result, kind: "image", publicPath: uploadPublicPath(result.relativePath) });
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
