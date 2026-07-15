import Link from "next/link";
import { connection } from "next/server";

import { PublicShell } from "@/app/_publicShell";
import { categoryLabel } from "@/lib/content/categories";
import { articlePath, categoryPath } from "@/lib/content/urls";
import { publicPageMetadata } from "@/lib/metadata";
import { listCachedPublishedArticles } from "@/lib/services/public-content";
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

export default async function ArchivePage() {
  await connection();
  const groups = groupByYear(await listCachedPublishedArticles());

  return (
    <PublicShell mastheadHeadingLevel={2}>
      <main className="container pb-14">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">Complete index</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="sans text-3xl font-bold leading-tight md:text-4xl">Archive</h1>
          </div>
        </header>

        {groups.length ? (
          <div className="divide-y divide-[var(--rule)]">
            {groups.map((group) => (
              <section key={group.year} className="grid gap-5 py-8 md:grid-cols-[8rem_1fr]" aria-labelledby={`archive-${group.year}`}>
                <h2 id={`archive-${group.year}`} className="sans text-3xl font-bold">
                  {group.year}
                </h2>
                <ol className="grid gap-4">
                  {group.articles.map((article) => (
                    <li key={article.id} className="grid gap-1 border-b border-[var(--rule)] pb-4 sm:grid-cols-[7rem_8rem_1fr] sm:items-baseline">
                      <time className="sans text-xs text-[var(--muted)]" dateTime={article.publishedAt ?? article.updatedAt}>
                        {(article.publishedAt ?? article.updatedAt).slice(0, 10)}
                      </time>
                      <Link className="sans text-xs text-[var(--muted)] hover:text-[var(--ink)]" href={categoryPath(article.category)}>
                        {categoryLabel(article.category)}
                      </Link>
                      <Link className="text-xl font-bold leading-snug hover:text-[var(--accent)]" href={articlePath(article.category, article.slug)}>
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
      </main>
    </PublicShell>
  );
}
