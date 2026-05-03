import { ArticleCard } from "@/components/ArticleCard";
import { categories, type CategoryId } from "@/lib/content/categories";
import { listPublishedArticles } from "@/lib/services/articles";
import { PublicShell } from "./_publicShell";

export function CategoryPage({ category }: { category: CategoryId }) {
  const articles = listPublishedArticles(category);
  return (
    <PublicShell>
      <main className="container py-10">
        <h1 className="border-b border-[var(--rule)] pb-4 text-5xl font-bold">{categories[category].label}</h1>
        {articles.length ? (
          articles.map((article) => <ArticleCard key={article.id} article={article} large />)
        ) : (
          <p className="sans py-10 text-sm text-[var(--muted)]">No published articles in this archive yet.</p>
        )}
      </main>
    </PublicShell>
  );
}
