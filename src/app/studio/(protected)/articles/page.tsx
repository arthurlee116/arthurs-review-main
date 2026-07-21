import Link from "next/link";
import { connection } from "next/server";
import { FeaturedArticleButton } from "@/components/studio/FeaturedArticleButton";
import { TranslateMissingEnglishButton } from "@/components/studio/TranslateMissingEnglishButton";
import { PageNavigation } from "@/components/PageNavigation";
import { listStudioArticlePage } from "@/lib/services/articles";
import { MAX_SEARCH_CODE_POINTS } from "@/lib/search-limits";

export const instant = false;

type ArticleSearchParams = {
  status?: string;
  category?: string;
  q?: string;
  page?: string;
};

function pageNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<ArticleSearchParams> }) {
  await connection();
  const params = await searchParams;
  const status = params.status === "draft" || params.status === "published" ? params.status : "all";
  const category = params.category === "commentary" || params.category === "society" || params.category === "misc" ? params.category : "all";
  const query = params.q ?? "";
  const articlePage = listStudioArticlePage({
    status,
    category,
    query,
    page: pageNumber(params.page),
  });
  return (
    <section>
      <h1 className="text-4xl font-bold">Articles</h1>
      <TranslateMissingEnglishButton />
      <form className="sans mt-6 grid gap-3 border-y border-[var(--rule)] py-4 md:grid-cols-[1fr_1fr_2fr_auto]">
        <label className="grid gap-2">
          Status
          <select className="border border-[var(--rule)] bg-white p-2" name="status" defaultValue={status}>
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
        <label className="grid gap-2">
          Category
          <select className="border border-[var(--rule)] bg-white p-2" name="category" defaultValue={category}>
            <option value="all">All</option>
            <option value="commentary">时事评论</option>
            <option value="society">社会分析</option>
            <option value="misc">杂七杂八</option>
          </select>
        </label>
        <label className="grid gap-2">
          Search
          <input className="border border-[var(--rule)] bg-white p-2" name="q" defaultValue={query} maxLength={MAX_SEARCH_CODE_POINTS} />
        </label>
        <button type="submit" className="self-end border border-[var(--rule)] bg-[var(--ink)] px-4 py-2 text-[var(--paper)]">
          Apply filters
        </button>
      </form>
      <ul className="sans mt-6" aria-label="Articles">
        {articlePage.items.map((article) => (
          <li key={article.id} className="grid min-w-0 gap-2 border-b border-[var(--rule)] py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Link className="font-medium underline-offset-4 hover:underline" href={`/studio/articles/${article.id}`}>
                {article.titleZh}
              </Link>
              {article.isFeatured ? (
                <span className="border border-[var(--accent)] bg-[var(--accent)] px-2 py-0.5 text-[0.68rem] font-bold text-[var(--paper)]">Featured</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)] sm:justify-end">
              <span>{article.status}</span>
              {article.status === "published" && !article.isFeatured ? <FeaturedArticleButton articleId={article.id} title={article.titleZh} /> : null}
            </div>
          </li>
        ))}
      </ul>
      <PageNavigation
        basePath="/studio/articles"
        page={articlePage.page}
        totalPages={articlePage.totalPages}
        label="Studio article pages"
        params={{
          status: status === "all" ? undefined : status,
          category: category === "all" ? undefined : category,
          q: query || undefined,
        }}
      />
    </section>
  );
}
