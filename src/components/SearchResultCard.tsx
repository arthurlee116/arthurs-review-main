import Link from "next/link";
import { ArticleMeta } from "@/components/ArticleMeta";
import { CoverImage, coverImageSizes } from "@/components/CoverImage";
import { articlePath } from "@/lib/content/urls";
import type { SearchArticleResult } from "@/lib/services/search";

export function SearchResultCard({ result }: { result: SearchArticleResult }) {
  const { article, excerptParts } = result;

  return (
    <article className="border-b border-[var(--rule)] py-7">
      {article.coverImagePath ? (
        <CoverImage className="mb-5" path={article.coverImagePath} alt="" sizes={coverImageSizes.largeCard} />
      ) : null}
      <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
      <h2 className="mt-3 text-4xl font-bold leading-none md:text-5xl">
        <Link href={articlePath(article.category, article.slug)}>{article.titleZh}</Link>
      </h2>
      {excerptParts.length ? (
        <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--muted)]">
          {excerptParts.map((part, index) =>
            part.highlighted ? (
              <mark key={index} className="bg-[var(--accent)] px-1 text-[var(--ink)]">
                {part.text}
              </mark>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </p>
      ) : null}
    </article>
  );
}
