import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { clearFeaturedArticle, setFeaturedArticle } from "@/lib/services/articles";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return updateFeatured(request, context, true);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return updateFeatured(request, context, false);
}

async function updateFeatured(request: Request, context: { params: Promise<{ id: string }> }, featured: boolean) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    const articleId = Number(id);
    if (!Number.isInteger(articleId) || articleId < 1) {
      return Response.json({ error: "Invalid article id." }, { status: 400 });
    }
    const article = featured ? setFeaturedArticle(articleId) : clearFeaturedArticle(articleId);
    return Response.json({ article });
  } catch (error) {
    return apiError(error);
  }
}
