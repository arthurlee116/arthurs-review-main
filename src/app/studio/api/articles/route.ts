import { apiError, ArticleBodySchema, requireApiAdmin } from "@/app/studio/api/_helpers";
import { createArticle, listStudioArticlePage } from "@/lib/services/articles";

function pageNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

export async function GET(request: Request) {
  const unauthorized = await requireApiAdmin(request, { csrf: false });
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const category = params.get("category");
  const result = listStudioArticlePage({
    page: pageNumber(params.get("page")),
    status: status === "draft" || status === "published" ? status : "all",
    category: category === "commentary" || category === "society" || category === "misc" ? category : "all",
    query: params.get("q") ?? "",
  });
  return Response.json({ ...result, articles: result.items });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const input = ArticleBodySchema.parse(await request.json());
    return Response.json({ article: createArticle(input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
