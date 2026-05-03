import { ArticleBodySchema, requireApiAdmin } from "@/app/studio/api/_helpers";
import { createArticle, listStudioArticles } from "@/lib/services/articles";

export async function GET(request: Request) {
  const unauthorized = await requireApiAdmin(request, { csrf: false });
  if (unauthorized) return unauthorized;
  return Response.json({ articles: listStudioArticles() });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  const input = ArticleBodySchema.parse(await request.json());
  return Response.json({ article: createArticle(input) }, { status: 201 });
}
