import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { translatePublishedMissingEnglish } from "@/lib/translation/service";

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const result = await translatePublishedMissingEnglish();
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
