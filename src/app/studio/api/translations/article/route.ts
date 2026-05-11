import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { TranslationInputSchema } from "@/lib/translation/schema";
import { translateArticleDraft } from "@/lib/translation/service";

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const input = TranslationInputSchema.parse(await request.json());
    const translation = await translateArticleDraft(input);
    return Response.json({ translation });
  } catch (error) {
    return apiError(error);
  }
}
