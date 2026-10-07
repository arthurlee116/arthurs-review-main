import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
import { type Locale } from "@/lib/i18n/locale";
import { io } from "next/cache";
import { Suspense } from "react";
import { ArticleCard } from "@/components/ArticleCard";
import { publicPageMetadata } from "@/lib/metadata";
import { listCachedPublishedArticles } from "@/lib/services/public-content";
import { PublicShell } from "@/app/_publicShell";

export async function generateMetadata() {
  const locale = await getLocale();
  return publicPageMetadata({
    locale,
    title: "Arthur's Review",
    description: dictionary(locale).siteDescription,
    path: "/",
  });
}

export async function HomeContent({ locale = "zh" }: { locale?: Locale } = {}) {
  await io();
  const articles = await listCachedPublishedArticles(undefined, { excludeLife: true, limit: 12 });
  const featured = articles[0];
  const feed = articles.filter((article) => article.id !== featured?.id).slice(0, 11);

  return (
    <PublicShell locale={locale}>
      <main className="container pb-10 pt-4">
        {featured ? (
          <section className="grid gap-8 border-b-2 border-[var(--rule)] pb-8 md:grid-cols-[1.35fr_1fr]">
            {/* ponytail: -mt-7 cancels ArticleCard's own py-7 so the section hugs the nav rule */}
            <div className="-mt-7">
              <ArticleCard locale={locale} article={featured} large eagerImage />
            </div>
            <div className="-mt-7">
              {feed.slice(0, 3).map((article) => (
                <ArticleCard locale={locale} key={article.id} article={article} />
              ))}
            </div>
          </section>
        ) : (
          <p className="sans border-y border-[var(--rule)] py-12 text-center text-sm text-[var(--muted)]">{dictionary(locale).noArticles}</p>
        )}
        <section className="py-8">
          {feed.slice(3, 11).map((article) => (
            <ArticleCard locale={locale} key={article.id} article={article} />
          ))}
        </section>
      </main>
    </PublicShell>
  );
}

export default async function HomePage() {
  const locale = await getLocale();
  return (
    <Suspense fallback={<PublicShell locale={locale}><main className="container min-h-[50vh]" aria-busy="true" /></PublicShell>}>
      <HomeContent locale={locale} />
    </Suspense>
  );
}
