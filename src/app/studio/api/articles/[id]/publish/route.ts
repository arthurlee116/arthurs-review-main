import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { getArticleById, publishArticle } from "@/lib/services/articles";
import { invalidateArticlePublication } from "@/lib/services/public-cache";
import { schedulePublicationProof } from "@/app/studio/api/articles/_publicationProof";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    const articleId = Number(id);
    const previous = getArticleById(articleId, { includeDraft: false });
    const article = publishArticle(articleId);
    invalidateArticlePublication({
      oldPath: previous && { category: previous.category, slug: previous.slug },
      newPath: { category: article.category, slug: article.slug },
    });
    schedulePublicationProof(article);
    return Response.json({ article });
  } catch (error) {
    return apiError(error);
  }
}
