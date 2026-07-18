import { connection } from "next/server";
import { ArticleCard } from "@/components/ArticleCard";
import { publicPageMetadata } from "@/lib/metadata";
import { listCachedPublishedArticles } from "@/lib/services/public-content";
import { PublicShell } from "./_publicShell";

export const instant = false;

export function generateMetadata() {
  return publicPageMetadata({
    title: "Arthur's Review",
    description: "Arthur's Review, a personal intellectual publication.",
    path: "/",
  });
}

export default async function HomePage() {
  await connection();
  const articles = await listCachedPublishedArticles();
  const featured = articles.find((article) => article.isFeatured) ?? articles[0];
  const feed = articles.filter((article) => article.id !== featured?.id).slice(0, 11);

  return (
    <PublicShell noticePlacement="beforeNav">
      <main className="container py-10">
        {featured ? (
          <section className="grid gap-8 border-b-2 border-[var(--rule)] pb-8 md:grid-cols-[1.35fr_1fr]">
            <ArticleCard article={featured} large eagerImage featured />
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
          {feed.slice(3, 11).map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </section>
      </main>
    </PublicShell>
  );
}
