import { dictionary } from "@/lib/i18n/dictionary";
import { localizedPath, type Locale } from "@/lib/i18n/locale";
import { articleDisplay } from "@/lib/i18n/article";
import Link from "next/link";
import { ArticleMeta } from "@/components/ArticleMeta";
import { CoverImage, coverImageSizes } from "@/components/CoverImage";
import { articlePath } from "@/lib/content/urls";
import type { Article } from "@/lib/services/articles";

export function ArticleCard({
  article,
  large = false,
  eagerImage = false,
  featured = false,
  locale = "zh",
}: {
  article: Article;
  large?: boolean;
  eagerImage?: boolean;
  featured?: boolean;
  locale?: Locale;
}) {
  const display = articleDisplay(article, locale);
  return (
    <article className="group border-b border-[var(--rule)] py-7">
      {article.coverImagePath ? (
        <CoverImage className="mb-5" path={article.coverImagePath} alt="" sizes={large ? coverImageSizes.largeCard : coverImageSizes.card} eager={eagerImage} />
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ArticleMeta locale={locale} category={article.category} publishedAt={article.publishedAt} />
        {featured ? (
          <span className="sans border-l-2 border-[var(--accent)] pl-2 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">{dictionary(locale).featured}</span>
        ) : null}
      </div>
      {featured && !article.coverImagePath ? <div className="mt-4 h-1.5 w-16 bg-[var(--accent)]" aria-hidden="true" /> : null}
      <h2 className={large ? "mt-3 text-2xl font-bold leading-tight md:text-5xl md:leading-none" : "mt-3 text-2xl font-bold leading-tight md:text-3xl"}>
        <Link className="transition-colors group-hover:text-[var(--accent)] focus-visible:text-[var(--accent)]" href={localizedPath(articlePath(article.category, article.slug), locale)}>{display.title}</Link>
      </h2>
      {display.excerpt ? <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--muted)]">{display.excerpt}</p> : null}
    </article>
  );
}
