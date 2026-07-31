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
  return await getArticlePageMetadata("life", slug, undefined);
}

async function LifeArticle({ slug }: { slug: string }) {
  const article = await getCachedPublishedArticle("life", slug);
  if (!article) {
    const target = await getCachedArticleUrlRedirect("life", slug);
    if (target) permanentRedirect(articlePath(target.category, target.slug));
    notFound();
  }

  const url = absoluteUrl(articlePath(article.category, article.slug));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.titleZh,
    description: article.excerptZh,
    url,
    mainEntityOfPage: url,
    datePublished: article.publishedAt ?? article.updatedAt,
    dateModified: article.updatedAt,
    author: { "@type": "Person", name: "Arthur" },
    publisher: { "@type": "Organization", name: "Arthur's Review", url: absoluteUrl("/") },
    image: article.coverImagePath ? [absoluteUrl(uploadPublicPath(article.coverImagePath))] : undefined,
  };

  return (
    <PublicShell mastheadHeadingLevel={2}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <main>
        <LifeArticleView article={article} />
      </main>
    </PublicShell>
  );
}

export default function LifeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<ArticlePageFallback />}>
      <LifeArticleFromParams params={params} />
    </Suspense>
  );
}

async function LifeArticleFromParams({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LifeArticle slug={slug} />;
}
