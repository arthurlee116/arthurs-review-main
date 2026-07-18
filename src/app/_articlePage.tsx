import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArticleMeta } from "@/components/ArticleMeta";
import { ContactNotice } from "@/components/ContactNotice";
import { CoverImage, coverImageSizes } from "@/components/CoverImage";
import { ArticleRenderer } from "@/components/ArticleRenderer";
import { FeedbackCTA } from "@/components/FeedbackCTA";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { articlePath } from "@/lib/content/urls";
import { categories, categoryLabel, type CategoryId } from "@/lib/content/categories";
import { getCachedPublishedArticle } from "@/lib/services/public-content";
import { articleMetadata } from "@/lib/metadata";
import { uploadPublicPath } from "@/lib/media/paths";
import { absoluteUrl } from "@/lib/seo";
import { listPublicationProofs } from "@/lib/services/publication-proofs";
import { PublicShell } from "./_publicShell";

const SINGLE_LINE_TITLE_MAX = 9;

export async function getArticlePageMetadata(category: CategoryId, slug: string, lang?: string) {
  await connection();
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
  await connection();
  const article = await getCachedPublishedArticle(category, slug);
  if (!article) notFound();
  const useEnglish = lang === "en" && article.bodyEn;
  const title = useEnglish ? (article.titleEn ?? article.titleZh) : article.titleZh;
  const singleLineTitle = Array.from(title.trim()).length <= SINGLE_LINE_TITLE_MAX;
  const description = (useEnglish ? article.excerptEn : article.seoDescription) || article.seoDescription || article.excerptZh;
  const url = absoluteUrl(articlePath(article.category, article.slug));
  const categoryUrl = absoluteUrl(categories[article.category].href);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
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
      url: absoluteUrl("/"),
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
        item: absoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: categoryLabel(article.category),
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
  const proofs = listPublicationProofs(article.id).filter((proof) => proof.otsPath || proof.waybackUrl);

  return (
    <PublicShell mastheadHeadingLevel={2}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }} />
      <main className="container pb-12 pt-8">
        <ContactNotice className="mb-8" />
        <article className="reading">
          <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
          <LanguageSwitch hasEnglish={Boolean(article.bodyEn)} currentPath={articlePath(article.category, article.slug)} />
          <h1
            className={`mt-5 text-[min(48px,9.5vw)] font-bold leading-none md:text-7xl ${singleLineTitle ? "whitespace-nowrap" : "max-w-[9.5em] text-balance md:max-w-none"}`}
          >
            {title}
          </h1>
          {article.coverImagePath ? (
            <CoverImage className="mt-8" path={article.coverImagePath} alt={article.titleZh} sizes={coverImageSizes.article} eager />
          ) : null}
          <div className="mt-10">
            <ArticleRenderer markdown={(useEnglish ? article.bodyEn : article.bodyZh) ?? ""} />
          </div>
          {proofs.length ? (
            <details className="sans mt-10 border-t border-[var(--rule)] pt-4 text-xs text-[var(--muted)]">
              <summary className="w-fit cursor-pointer select-none text-xs text-[var(--muted)]">Proof of Publication</summary>
              <div className="mt-4 grid gap-4">
                <p>This article may have been published earlier, but this proof shows it existed no later than the date below.</p>
                {proofs.map((proof) => (
                  <div key={proof.id} className="grid gap-1 border-l border-[var(--rule)] pl-3">
                    <time dateTime={proof.createdAt}>{new Date(proof.createdAt).toLocaleString("en-GB")}</time>
                    {proof.waybackUrl ? (
                      <a className="underline" href={proof.waybackUrl} rel="noreferrer" target="_blank">
                        Wayback snapshot
                      </a>
                    ) : null}
                    <span>
                      SHA-256: <span className="break-all">{proof.documentSha256}</span>
                    </span>
                    <a
                      className="underline underline-offset-2 hover:text-foreground"
                      href={`/proofs/${proof.id}/source`}
                    >
                      Download source
                    </a>
                    {proof.otsPath ? (
                      <a className="underline" href={`/proofs/${proof.id}/ots`}>
                        Download OTS
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <FeedbackCTA articleTitle={title} />
        </article>
      </main>
    </PublicShell>
  );
}
