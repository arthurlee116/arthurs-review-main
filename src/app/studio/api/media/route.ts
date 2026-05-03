import { requireApiAdmin } from "@/app/studio/api/_helpers";
import { processImageUpload } from "@/lib/media/image";
import { uploadPublicPath } from "@/lib/media/paths";

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "File is required" }, { status: 400 });
  const result = await processImageUpload(Buffer.from(await file.arrayBuffer()), file.name, file.type);
  return Response.json({ ...result, publicPath: uploadPublicPath(result.relativePath) });
}
