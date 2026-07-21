import { apiError, ArticleUpdateBodySchema, requireApiAdmin } from "@/app/studio/api/_helpers";
import { deleteArticle, getArticleById, updateArticle } from "@/lib/services/articles";
import { invalidateArticlePublication, invalidateProofs } from "@/lib/services/public-cache";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request, { csrf: false });
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const article = getArticleById(Number(id), { includeDraft: true });
  return article ? Response.json({ article }) : Response.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    const { expectedDraftRevisionId, ...input } = ArticleUpdateBodySchema.parse(await request.json());
    const article = updateArticle(Number(id), input, expectedDraftRevisionId);
    return Response.json({ article });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    const articleId = Number(id);
    const published = getArticleById(articleId, { includeDraft: false });
    const ok = deleteArticle(articleId);
    if (ok) {
      invalidateArticlePublication({ oldPath: published && { category: published.category, slug: published.slug } });
      invalidateProofs(articleId);
    }
    return Response.json({ ok });
  } catch (error) {
    return apiError(error);
  }
}
