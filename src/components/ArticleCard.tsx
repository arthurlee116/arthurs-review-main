import Link from "next/link";
import { ArticleMeta } from "@/components/ArticleMeta";
import { CoverImage, coverImageSizes } from "@/components/CoverImage";
import { articlePath } from "@/lib/content/urls";
import type { Article } from "@/lib/services/articles";

export function ArticleCard({ article, large = false, eagerImage = false }: { article: Article; large?: boolean; eagerImage?: boolean }) {
  return (
    <article className="border-b border-[var(--rule)] py-7">
      {article.coverImagePath ? (
        <CoverImage className="mb-5" path={article.coverImagePath} alt="" sizes={large ? coverImageSizes.largeCard : coverImageSizes.card} eager={eagerImage} />
      ) : null}
      <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
      <h2 className={large ? "mt-3 text-4xl font-bold leading-none md:text-5xl" : "mt-3 text-2xl font-bold leading-tight md:text-3xl"}>
        <Link href={articlePath(article.category, article.slug)}>{article.titleZh}</Link>
      </h2>
      {article.excerptZh ? <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--muted)]">{article.excerptZh}</p> : null}
    </article>
  );
}
