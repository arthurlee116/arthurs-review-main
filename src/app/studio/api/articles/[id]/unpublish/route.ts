import { apiError, requireApiAdmin } from "@/app/studio/api/_helpers";
import { unpublishArticle } from "@/lib/services/articles";
import { invalidatePublicContent } from "@/app/studio/api/articles/_publicationProof";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    const article = unpublishArticle(Number(id));
    invalidatePublicContent();
    return Response.json({ article });
  } catch (error) {
    return apiError(error);
  }
}
