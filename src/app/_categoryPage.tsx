import { dictionary } from "@/lib/i18n/dictionary";
import { type Locale } from "@/lib/i18n/locale";
import { io } from "next/cache";
import { ArticleCard } from "@/components/ArticleCard";
import { type CategoryId } from "@/lib/content/categories";
import { listCachedPublishedArticles } from "@/lib/services/public-content";
import { PublicShell } from "./_publicShell";

export async function CategoryPage({ category, locale = "zh" }: { category: CategoryId; locale?: Locale }) {
  await io();
  const articles = await listCachedPublishedArticles(category, { limit: 8 });
  return (
    <PublicShell locale={locale}>
      <main className="container pb-10">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">{dictionary(locale).archive}</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">{dictionary(locale)[category]}</h1>
          </div>
        </header>
        {articles.length ? (
          <section>
            {articles.map((article, index) => (
              <ArticleCard locale={locale} key={article.id} article={article} large eagerImage={index === 0} />
            ))}
          </section>
        ) : (
          <p className="sans py-10 text-sm text-[var(--muted)]">{dictionary(locale).noCategoryArticles}</p>
        )}
      </main>
    </PublicShell>
  );
}

export function CategoryPageFallback({ locale = "zh" }: { locale?: Locale }) {
  return <PublicShell locale={locale}><main className="container min-h-[50vh]" aria-busy="true" /></PublicShell>;
}
