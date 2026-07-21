import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { enqueuePublishedMissingEnglishTranslations, getTranslationBatchProgress } from "@/lib/translation/service";

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const batch = enqueuePublishedMissingEnglishTranslations();
    return Response.json({ batch }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  const unauthorized = await requireApiAdmin(request, { csrf: false });
  if (unauthorized) return unauthorized;
  const batchId = new URL(request.url).searchParams.get("batch");
  if (!batchId) return Response.json({ error: "Missing batch id" }, { status: 400 });
  const batch = getTranslationBatchProgress(batchId);
  return batch ? Response.json({ batch }) : Response.json({ error: "Batch not found" }, { status: 404 });
}
