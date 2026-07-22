import { Suspense } from "react";
import { SearchBox } from "@/components/SearchBox";
import { SearchPagination } from "@/components/SearchPagination";
import { SearchResultCard } from "@/components/SearchResultCard";
import { searchArticleResultsHybrid } from "@/lib/services/search";
import { PublicShell } from "@/app/_publicShell";
import { publicPageMetadata } from "@/lib/metadata";

export function generateMetadata() {
  return publicPageMetadata({
    title: "Search",
    description: "Search Arthur's Review by title, body, category, and tags.",
    path: "/search",
  });
}

function pageNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

export async function SearchResults({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = "", page } = await searchParams;
  const resultPage = await searchArticleResultsHybrid(q, { page: pageNumber(page) });

  return (
    <>
      <div className="my-8">
        <SearchBox defaultValue={q} />
      </div>
      {q && resultPage.results.length === 0 ? <p className="sans py-10 text-sm text-[var(--muted)]">No matching articles.</p> : null}
      {resultPage.results.map((result) => (
        <SearchResultCard key={result.article.id} result={result} />
      ))}
      <SearchPagination resultPage={resultPage} />
    </>
  );
}

export default function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  return (
    <PublicShell>
      <main className="container pb-10">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">Find</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="sans text-3xl font-bold leading-tight md:text-4xl">Search</h1>
          </div>
        </header>
        <Suspense fallback={<p className="sans py-10 text-sm text-[var(--muted)]">Loading search…</p>}>
          <SearchResults searchParams={searchParams} />
        </Suspense>
      </main>
    </PublicShell>
  );
}
