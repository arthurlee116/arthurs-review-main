import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
import { localizedPath, languageTag, type Locale } from "@/lib/i18n/locale";
import { articleDisplay } from "@/lib/i18n/article";
import Link from "next/link";
import { io } from "next/cache";
import { Suspense } from "react";

import { PublicShell } from "@/app/_publicShell";
import { PageNavigation } from "@/components/PageNavigation";
import { categoryLabel } from "@/lib/content/categories";
import { articlePath, categoryPath } from "@/lib/content/urls";
import { publicPageMetadata } from "@/lib/metadata";
import { listCachedPublishedArticlePage } from "@/lib/services/public-content";
import type { Article } from "@/lib/services/articles";

export async function generateMetadata() {
  const locale = await getLocale();
  return publicPageMetadata({
    locale,
    title: dictionary(locale).archive,
    description: dictionary(locale).archiveDescription,
    path: "/archive",
  });
}

function groupByYear(articles: Article[]) {
  const groups: Array<{ year: string; articles: Article[] }> = [];
  for (const article of articles) {
    const year = (article.publishedAt ?? article.updatedAt).slice(0, 4);
    const current = groups.at(-1);
    if (current?.year === year) current.articles.push(article);
    else groups.push({ year, articles: [article] });
  }
  return groups;
}

function pageNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

export async function ArchiveContent({ page = 1, locale = "zh" }: { page?: number; locale?: Locale } = {}) {
  await io();
  const articlePage = await listCachedPublishedArticlePage(page, 50, { excludeLife: true });
  const groups = groupByYear(articlePage.items);

  return (
    <PublicShell locale={locale} mastheadHeadingLevel={2}>
      <main className="container overflow-x-hidden pb-16">
        <header className="max-w-5xl py-10 md:py-14">
          <p className="sans text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">{dictionary(locale).completeIndex}</p>
          <h1 className="mt-4 max-w-5xl text-5xl font-bold leading-[0.95] tracking-[-0.04em] md:text-7xl">{dictionary(locale).archive}</h1>
          <p className="mt-6 max-w-[55ch] text-lg leading-8 text-[var(--muted)]">{dictionary(locale).archiveIntro}</p>
        </header>

        {groups.length ? (
          <div className="border-t border-[var(--rule)]">
            {groups.map((group) => (
              <section key={group.year} className="grid gap-6 border-b border-[var(--rule)] py-10 md:grid-cols-[10rem_1fr] md:gap-12" aria-labelledby={`archive-${group.year}`}>
                <h2 id={`archive-${group.year}`} className="text-5xl font-bold leading-none tracking-[-0.04em]">
                  {group.year}
                </h2>
                <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                  {group.articles.map((article) => (
                    <li key={article.id} className="group grid content-start gap-2">
                      <p className="sans flex flex-wrap gap-x-4 text-xs text-[var(--muted)]">
                        <time dateTime={article.publishedAt ?? article.updatedAt}>{new Date(article.publishedAt ?? article.updatedAt).toLocaleDateString(languageTag[locale], { timeZone: "UTC" })}</time>
                        <Link className="transition-colors hover:text-[var(--ink)] focus-visible:text-[var(--ink)]" href={localizedPath(categoryPath(article.category), locale)}>
                          {categoryLabel(article.category, locale)}
                        </Link>
                      </p>
                      <Link className="text-xl font-bold leading-snug transition-colors group-hover:text-[var(--accent)] focus-visible:text-[var(--accent)]" href={localizedPath(articlePath(article.category, article.slug), locale)}>
                        {articleDisplay(article, locale).title}
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <p className="sans py-10 text-sm text-[var(--muted)]">{dictionary(locale).noArticles}</p>
        )}
        <PageNavigation locale={locale} basePath="/archive" page={articlePage.page} totalPages={articlePage.totalPages} label={dictionary(locale).pages} />
      </main>
    </PublicShell>
  );
}

async function ArchiveContentFromParams({ searchParams, locale }: { searchParams: Promise<{ page?: string }>; locale: Locale }) {
  const { page } = await searchParams;
  return <ArchiveContent locale={locale} page={pageNumber(page)} />;
}

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<PublicShell locale={locale} mastheadHeadingLevel={2}><main className="container min-h-[50vh]" aria-busy="true" /></PublicShell>}>
      <ArchiveContentFromParams locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
