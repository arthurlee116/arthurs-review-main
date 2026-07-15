import { connection } from "next/server";
import { ArticleCard } from "@/components/ArticleCard";
import { categories, type CategoryId } from "@/lib/content/categories";
import { listCachedPublishedArticles } from "@/lib/services/public-content";
import { PublicShell } from "./_publicShell";

export async function CategoryPage({ category }: { category: CategoryId }) {
  await connection();
  const articles = await listCachedPublishedArticles(category);
  return (
    <PublicShell>
      <main className="container pb-10">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">Archive</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="sans text-3xl font-bold leading-tight md:text-4xl">{categories[category].label}</h1>
          </div>
        </header>
        {articles.length ? (
          <section>
            {articles.slice(0, 8).map((article, index) => (
              <ArticleCard key={article.id} article={article} large eagerImage={index === 0} />
            ))}
          </section>
        ) : (
          <p className="sans py-10 text-sm text-[var(--muted)]">No published articles in this archive yet.</p>
        )}
      </main>
    </PublicShell>
  );
}
