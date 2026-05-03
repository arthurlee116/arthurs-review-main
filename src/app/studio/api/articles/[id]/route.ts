import { ArticleBodySchema, requireApiAdmin } from "@/app/studio/api/_helpers";
import { deleteArticle, getArticleById, updateArticle } from "@/lib/services/articles";

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
  const { id } = await context.params;
  const input = ArticleBodySchema.parse(await request.json());
  return Response.json({ article: updateArticle(Number(id), input) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  return Response.json({ ok: deleteArticle(Number(id)) });
}
