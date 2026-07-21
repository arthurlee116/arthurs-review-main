import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { setFeaturedArticle } from "@/lib/services/articles";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    const articleId = Number(id);
    if (!Number.isInteger(articleId) || articleId < 1) {
      return Response.json({ error: "Invalid article id." }, { status: 400 });
    }
    const article = setFeaturedArticle(articleId);
    return Response.json({ article });
  } catch (error) {
    return apiError(error);
  }
}
