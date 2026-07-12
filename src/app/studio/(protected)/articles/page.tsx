import Link from "next/link";
import { TranslateMissingEnglishButton } from "@/components/studio/TranslateMissingEnglishButton";
import { listStudioArticles } from "@/lib/services/articles";
import type { CategoryId } from "@/lib/content/categories";

type ArticleSearchParams = {
  status?: string;
  category?: string;
  q?: string;
};

function matchesQuery(article: ReturnType<typeof listStudioArticles>[number], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [article.titleZh, article.titleEn, article.slug, article.excerptZh, article.excerptEn, article.category, article.tags.map((tag) => tag.name).join(" ")]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .includes(normalized);
}

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<ArticleSearchParams> }) {
  const params = await searchParams;
  const status = params.status === "draft" || params.status === "published" ? params.status : "all";
  const category = params.category === "commentary" || params.category === "society" || params.category === "misc" ? params.category : "all";
  const query = params.q ?? "";
  const articles = listStudioArticles().filter((article) => {
    if (status !== "all" && article.status !== status) return false;
    if (category !== "all" && article.category !== (category as CategoryId)) return false;
    return matchesQuery(article, query);
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
          <input className="border border-[var(--rule)] bg-white p-2" name="q" defaultValue={query} />
        </label>
        <button type="submit" className="self-end border border-[var(--rule)] bg-[var(--ink)] px-4 py-2 text-[var(--paper)]">
          Apply filters
        </button>
      </form>
      <div className="sans mt-6 grid gap-3">
        {articles.map((article) => (
          <Link key={article.id} className="flex justify-between border-b border-[var(--rule)] py-3" href={`/studio/articles/${article.id}`}>
            <span>{article.titleZh}</span>
            <span>{article.status}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
