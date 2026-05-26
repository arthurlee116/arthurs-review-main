import Link from "next/link";
import type { SearchArticleResultsPage } from "@/lib/services/search";

function searchPageHref(query: string, page: number) {
  const params = new URLSearchParams();
  params.set("q", query);
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}

export function SearchPagination({ resultPage }: { resultPage: SearchArticleResultsPage }) {
  if (resultPage.totalPages <= 1) return null;

  return (
    <nav className="sans mt-8 flex items-center justify-between border-y border-[var(--rule)] py-4 text-sm" aria-label="Search results pages">
      {resultPage.hasPreviousPage ? (
        <Link href={searchPageHref(resultPage.query, resultPage.page - 1)}>Previous</Link>
      ) : (
        <span className="text-[var(--muted)]">Previous</span>
      )}
      <span className="text-[var(--muted)]">
        Page {resultPage.page} of {resultPage.totalPages}
      </span>
      {resultPage.hasNextPage ? (
        <Link href={searchPageHref(resultPage.query, resultPage.page + 1)}>Next</Link>
      ) : (
        <span className="text-[var(--muted)]">Next</span>
      )}
    </nav>
  );
}
