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

export const metadata = publicPageMetadata({
  title: "Archive",
  description: "Every published article from Arthur's Review, grouped by year.",
  path: "/archive",
});

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

export async function ArchiveContent({ page = 1 }: { page?: number } = {}) {
  await io();
  const articlePage = await listCachedPublishedArticlePage(page);
  const groups = groupByYear(articlePage.items);

  return (
    <PublicShell mastheadHeadingLevel={2}>
      <main className="container overflow-x-hidden pb-16">
        <header className="max-w-5xl py-10 md:py-14">
          <p className="sans text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Complete index</p>
          <h1 className="mt-4 max-w-5xl text-5xl font-bold leading-[0.95] tracking-[-0.04em] md:text-7xl">Archive</h1>
          <p className="mt-6 max-w-[55ch] text-lg leading-8 text-[var(--muted)]">Every published article, grouped by year.</p>
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
                        <time dateTime={article.publishedAt ?? article.updatedAt}>{(article.publishedAt ?? article.updatedAt).slice(0, 10)}</time>
                        <Link className="transition-colors hover:text-[var(--ink)] focus-visible:text-[var(--ink)]" href={categoryPath(article.category)}>
                          {categoryLabel(article.category)}
                        </Link>
                      </p>
                      <Link className="text-xl font-bold leading-snug transition-colors group-hover:text-[var(--accent)] focus-visible:text-[var(--accent)]" href={articlePath(article.category, article.slug)}>
                        {article.titleZh}
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <p className="sans py-10 text-sm text-[var(--muted)]">No published articles yet.</p>
        )}
        <PageNavigation basePath="/archive" page={articlePage.page} totalPages={articlePage.totalPages} label="Archive pages" />
      </main>
    </PublicShell>
  );
}

async function ArchiveContentFromParams({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return <ArchiveContent page={pageNumber(page)} />;
}

export default function ArchivePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <Suspense fallback={<PublicShell mastheadHeadingLevel={2}><main className="container min-h-[50vh]" aria-busy="true" /></PublicShell>}>
      <ArchiveContentFromParams searchParams={searchParams} />
    </Suspense>
  );
}
