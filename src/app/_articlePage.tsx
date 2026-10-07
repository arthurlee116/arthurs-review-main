import { dictionary } from "@/lib/i18n/dictionary";
import { localizedPath, languageTag, type Locale } from "@/lib/i18n/locale";
import { articleDisplay } from "@/lib/i18n/article";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleMeta } from "@/components/ArticleMeta";
import { ContactNotice } from "@/components/ContactNotice";
import { CoverImage, coverImageSizes } from "@/components/CoverImage";
import { ArticleRenderer } from "@/components/ArticleRenderer";
import { FeedbackCTA } from "@/components/FeedbackCTA";
import { ReadingProgress } from "@/components/ReadingProgress";
import { articlePath } from "@/lib/content/urls";
import { categories, categoryLabel, type CategoryId } from "@/lib/content/categories";
import { getCachedArticleUrlRedirect, getCachedPublishedArticle, listCachedPublicationProofs } from "@/lib/services/public-content";
import { articleMetadata } from "@/lib/metadata";
import { uploadPublicPath } from "@/lib/media/paths";
import { absoluteUrl } from "@/lib/seo";
import { PublicShell } from "./_publicShell";

const SINGLE_LINE_TITLE_MAX = 7;

type ArticleRouteProps = {
  category: CategoryId;
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ lang?: string }>;
  locale?: Locale;
};

export function ArticlePageFallback({ locale = "zh" }: { locale?: Locale }) {
  return (
    <PublicShell locale={locale} mastheadHeadingLevel={2}>
      <main className="container min-h-[50vh]" aria-busy="true" />
    </PublicShell>
  );
}

export async function ArticlePageFromParams({ category, params, locale = "zh" }: ArticleRouteProps) {
  const { slug } = await params;
  return <ArticlePage category={category} slug={slug} lang={locale} />;
}

export async function getArticlePageMetadata(category: CategoryId, slug: string, lang?: string) {
  const article = await getCachedPublishedArticle(category, slug);
  if (!article) return {};
  return articleMetadata(article, lang);
}

export async function ArticlePage({
  category,
  slug,
  lang,
}: {
  category: CategoryId;
  slug: string;
  lang?: string;
}) {
  const locale = lang === "en" ? "en" : "zh";
  const t = dictionary(locale);
  const article = await getCachedPublishedArticle(category, slug);
  if (!article) {
    const target = await getCachedArticleUrlRedirect(category, slug);
    if (target) {
      const currentPath = articlePath(target.category, target.slug);
      permanentRedirect(localizedPath(currentPath, locale));
    }
    notFound();
  }
  const display = articleDisplay(article, locale);
  const { title } = display;
  const singleLineTitle = Array.from(title.trim()).length <= SINGLE_LINE_TITLE_MAX;
  const description = display.locale === "zh" ? article.seoDescription || display.excerpt : display.excerpt;
  const url = absoluteUrl(localizedPath(articlePath(article.category, article.slug), display.locale));
  const categoryUrl = absoluteUrl(localizedPath(categories[article.category].href, locale));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    inLanguage: languageTag[display.locale],
    description,
    url,
    mainEntityOfPage: url,
    datePublished: article.publishedAt ?? article.updatedAt,
    dateModified: article.updatedAt,
    author: {
      "@type": "Person",
      name: "Arthur",
    },
    publisher: {
      "@type": "Organization",
      name: "Arthur's Review",
      url: absoluteUrl(localizedPath("/", locale)),
    },
    image: article.coverImagePath ? [absoluteUrl(uploadPublicPath(article.coverImagePath))] : undefined,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Arthur's Review",
        item: absoluteUrl(localizedPath("/", locale)),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: categoryLabel(article.category, locale),
        item: categoryUrl,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: url,
      },
    ],
  };
  const proofs = (await listCachedPublicationProofs(article.id)).filter((proof) => proof.otsPath || proof.waybackUrl);

  return (
    <PublicShell locale={locale} mastheadHeadingLevel={2}>
      <ReadingProgress />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }} />
      <main className="container pb-12 pt-8">
        <ContactNotice locale={locale} className="mb-8" />
        <article className="reading" lang={languageTag[display.locale]}>
          <ArticleMeta locale={locale} category={article.category} publishedAt={article.publishedAt} />
          <h1
            className={`mt-5 text-[min(44px,8.5vw)] font-bold leading-none md:text-7xl ${singleLineTitle ? "whitespace-nowrap" : "max-w-[9.5em] text-balance md:max-w-none"}`}
          >
            {title}
          </h1>
          {article.coverImagePath ? (
            <CoverImage className="mt-8" path={article.coverImagePath} alt={title} sizes={coverImageSizes.article} eager />
          ) : null}
          <div className="mt-10">
            <ArticleRenderer markdown={display.body} />
          </div>
          {proofs.length ? (
            <details className="sans mt-10 border-t border-[var(--rule)] pt-4 text-xs text-[var(--muted)]">
              <summary className="w-fit cursor-pointer select-none text-xs text-[var(--muted)]">{t.proofOfPublication}</summary>
              <div className="mt-4 grid gap-4">
                <p>{t.proofExplanation}</p>
                {proofs.map((proof) => (
                  <div key={proof.id} className="grid gap-1 border-l border-[var(--rule)] pl-3">
                    <time dateTime={proof.createdAt}>{new Date(proof.createdAt).toLocaleString(languageTag[locale], { timeZone: "UTC" })}</time>
                    {proof.waybackUrl ? (
                      <a className="underline" href={proof.waybackUrl} rel="noreferrer" target="_blank">
                        {t.waybackSnapshot}
                      </a>
                    ) : null}
                    <span>
                      SHA-256: <span className="break-all">{proof.documentSha256}</span>
                    </span>
                    <a
                      className="underline underline-offset-2 hover:text-foreground"
                      href={`/proofs/${proof.id}/source`}
                    >
                      {t.downloadSource}
                    </a>
                    {proof.otsPath ? (
                      <>
                        <a className="underline" href={`/proofs/${proof.id}/ots`}>
                          {t.downloadOts}
                        </a>
                        <span>{t.otsExplanation}</span>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <FeedbackCTA locale={locale} articleTitle={title} />
        </article>
      </main>
    </PublicShell>
  );
}
