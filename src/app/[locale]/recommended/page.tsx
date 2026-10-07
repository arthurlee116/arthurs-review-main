import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
import { type Locale } from "@/lib/i18n/locale";
import { io } from "next/cache";
import { Suspense } from "react";
import { PublicShell } from "@/app/_publicShell";
import { ArticleCard } from "@/components/ArticleCard";
import { PageNavigation } from "@/components/PageNavigation";
import { publicPageMetadata } from "@/lib/metadata";
import { parsePageParam } from "@/lib/pagination";
import { listCachedPublishedArticlePage } from "@/lib/services/public-content";

export async function generateMetadata() {
  const locale = await getLocale();
  return publicPageMetadata({
    locale,
    title: dictionary(locale).recommended,
    description: dictionary(locale).recommendedDescription,
    path: "/recommended",
  });
}

export async function RecommendedContent({ page = 1, locale = "zh" }: { page?: number; locale?: Locale } = {}) {
  await io();
  const articles = await listCachedPublishedArticlePage(page, 50, { featuredOnly: true, excludeLife: true });
  return (
    <PublicShell locale={locale} mastheadHeadingLevel={2}>
      <main className="container pb-10">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">{dictionary(locale).recommendedReading}</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">{dictionary(locale).recommended}</h1>
          </div>
        </header>
        {articles.items.length ? (
          <section>
            {articles.items.map((article, index) => <ArticleCard locale={locale} key={article.id} article={article} large eagerImage={index === 0} />)}
          </section>
        ) : <p className="sans py-10 text-sm text-[var(--muted)]">{dictionary(locale).noRecommended}</p>}
        <PageNavigation locale={locale} basePath="/recommended" page={articles.page} totalPages={articles.totalPages} label={dictionary(locale).pages} />
      </main>
    </PublicShell>
  );
}

async function RecommendedContentFromParams({ searchParams, locale }: { searchParams: Promise<{ page?: string }>; locale: Locale }) {
  const { page } = await searchParams;
  return <RecommendedContent locale={locale} page={parsePageParam(page)} />;
}

export default async function RecommendedPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<PublicShell locale={locale} mastheadHeadingLevel={2}><main className="container min-h-[50vh]" aria-busy="true" /></PublicShell>}>
      <RecommendedContentFromParams locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
