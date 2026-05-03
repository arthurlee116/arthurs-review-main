import { ArticleCard } from "@/components/ArticleCard";
import { Masthead } from "@/components/Masthead";
import { PublicNav } from "@/components/PublicNav";
import { SearchBox } from "@/components/SearchBox";
import { listPublishedArticles } from "@/lib/services/articles";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const articles = listPublishedArticles();
  const featured = articles.find((article) => article.isFeatured) ?? articles[0];
  const feed = articles.filter((article) => article.id !== featured?.id);

  return (
    <>
      <Masthead />
      <PublicNav />
      <main className="container py-10">
        <div className="mb-8 flex justify-end">
          <SearchBox />
        </div>
        {featured ? (
          <section className="grid gap-8 border-b-2 border-[var(--rule)] pb-8 md:grid-cols-[1.35fr_1fr]">
            <ArticleCard article={featured} large />
            <div>
              {feed.slice(0, 3).map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        ) : (
          <p className="sans border-y border-[var(--rule)] py-12 text-center text-sm text-[var(--muted)]">No published articles yet.</p>
        )}
        <section className="py-8">
          {feed.slice(3).map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </section>
      </main>
    </>
  );
}
