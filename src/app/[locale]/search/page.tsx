import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
import { type Locale } from "@/lib/i18n/locale";
import { Suspense } from "react";
import { SearchBox } from "@/components/SearchBox";
import { SearchPagination } from "@/components/SearchPagination";
import { SearchResultCard } from "@/components/SearchResultCard";
import { parsePageParam } from "@/lib/pagination";
import { searchArticleResultsHybrid } from "@/lib/services/search";
import { PublicShell } from "@/app/_publicShell";
import { publicPageMetadata } from "@/lib/metadata";

export async function generateMetadata() {
  const locale = await getLocale();
  return publicPageMetadata({
    locale,
    title: dictionary(locale).search,
    description: dictionary(locale).searchDescription,
    path: "/search",
  });
}

export async function SearchResults({ searchParams, locale = "zh" }: { searchParams: Promise<{ q?: string; page?: string }>; locale?: Locale }) {
  const { q = "", page } = await searchParams;
  const resultPage = await searchArticleResultsHybrid(q, { locale, page: parsePageParam(page) });

  return (
    <>
      <div className="my-8">
        <SearchBox locale={locale} defaultValue={q} />
      </div>
      {q && resultPage.results.length === 0 ? <p className="sans py-10 text-sm text-[var(--muted)]">{dictionary(locale).noMatches}</p> : null}
      {resultPage.results.map((result) => (
        <SearchResultCard locale={locale} key={result.article.id} result={result} />
      ))}
      <SearchPagination locale={locale} resultPage={resultPage} />
    </>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const locale = await getLocale();
  return (
    <PublicShell locale={locale}>
      <main className="container pb-10">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">{dictionary(locale).find}</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">{dictionary(locale).search}</h1>
          </div>
        </header>
        <Suspense fallback={<p className="sans py-10 text-sm text-[var(--muted)]">{dictionary(locale).loadingSearch}</p>}>
          <SearchResults locale={locale} searchParams={searchParams} />
        </Suspense>
      </main>
    </PublicShell>
  );
}
