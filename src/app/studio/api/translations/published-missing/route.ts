import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { translatePublishedMissingEnglish } from "@/lib/translation/service";
import { getArticleById } from "@/lib/services/articles";
import { invalidatePublicContent } from "@/lib/services/public-cache";
import { schedulePublicationProof } from "@/app/studio/api/articles/_publicationProof";

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const result = await translatePublishedMissingEnglish();
    if (result.successes.length > 0) invalidatePublicContent();
    for (const { id } of result.successes) {
      const article = getArticleById(id, { includeDraft: true });
      if (article) schedulePublicationProof(article);
    }
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
