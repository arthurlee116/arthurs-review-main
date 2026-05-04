import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { unpublishArticle } from "@/lib/services/articles";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    return Response.json({ article: unpublishArticle(Number(id)) });
  } catch (error) {
    return apiError(error);
  }
}
