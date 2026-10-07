import { localizedPath, languageTag, type Locale } from "@/lib/i18n/locale";
import { articleDisplay } from "@/lib/i18n/article";
import { getLocale } from "@/lib/i18n/server";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticlePageFallback, getArticlePageMetadata } from "@/app/_articlePage";
import { PublicShell } from "@/app/_publicShell";
import { LifeArticleView } from "@/components/life/LifeArticleView";
import { articlePath } from "@/lib/content/urls";
import { uploadPublicPath } from "@/lib/media/paths";
import { getCachedArticleUrlRedirect, getCachedPublishedArticle } from "@/lib/services/public-content";
import { absoluteUrl } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return await getArticlePageMetadata("life", slug, await getLocale());
}

async function LifeArticle({ slug, locale }: { slug: string; locale: Locale }) {
  const article = await getCachedPublishedArticle("life", slug);
  if (!article) {
    const target = await getCachedArticleUrlRedirect("life", slug);
    if (target) permanentRedirect(localizedPath(articlePath(target.category, target.slug), locale));
    notFound();
  }

  const display = articleDisplay(article, locale);
  const url = absoluteUrl(localizedPath(articlePath(article.category, article.slug), display.locale));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: display.title,
    inLanguage: languageTag[display.locale],
    description: display.excerpt,
    url,
    mainEntityOfPage: url,
    datePublished: article.publishedAt ?? article.updatedAt,
    dateModified: article.updatedAt,
    author: { "@type": "Person", name: "Arthur" },
    publisher: { "@type": "Organization", name: "Arthur's Review", url: absoluteUrl(localizedPath("/", locale)) },
    image: article.coverImagePath ? [absoluteUrl(uploadPublicPath(article.coverImagePath))] : undefined,
  };

  return (
    <PublicShell locale={locale} mastheadHeadingLevel={2}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <main>
        <LifeArticleView locale={locale} article={article} />
      </main>
    </PublicShell>
  );
}

export default async function LifeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<ArticlePageFallback locale={locale} />}>
      <LifeArticleFromParams locale={locale} params={params} />
    </Suspense>
  );
}

async function LifeArticleFromParams({ params, locale }: { params: Promise<{ slug: string }>; locale: Locale }) {
  const { slug } = await params;
  return <LifeArticle locale={locale} slug={slug} />;
}
