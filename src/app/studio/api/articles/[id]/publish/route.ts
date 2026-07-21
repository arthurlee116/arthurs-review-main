import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { publishArticle } from "@/lib/services/articles";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    const articleId = Number(id);
    const article = publishArticle(articleId);
    return Response.json({ article });
  } catch (error) {
    return apiError(error);
  }
}
