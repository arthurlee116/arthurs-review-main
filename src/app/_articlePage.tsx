import { notFound } from "next/navigation";
import { ArticleMeta } from "@/components/ArticleMeta";
import { ArticleRenderer } from "@/components/ArticleRenderer";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { articlePath } from "@/lib/content/urls";
import type { CategoryId } from "@/lib/content/categories";
import { getPublishedArticle } from "@/lib/services/articles";
import { articleMetadata } from "@/lib/metadata";
import { uploadPublicPath } from "@/lib/media/paths";
import { PublicShell } from "./_publicShell";

export function getArticlePageMetadata(category: CategoryId, slug: string, lang?: string) {
  const article = getPublishedArticle(category, slug);
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
  const article = getPublishedArticle(category, slug);
  if (!article) notFound();
  const useEnglish = lang === "en" && article.bodyEn;
  const title = useEnglish ? (article.titleEn ?? article.titleZh) : article.titleZh;

  return (
    <PublicShell>
      <main className="container py-12">
        <article className="reading">
          <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
          <LanguageSwitch hasEnglish={Boolean(article.bodyEn)} currentPath={articlePath(article.category, article.slug)} />
          <h1 className="mt-5 text-5xl font-bold leading-none md:text-7xl">{title}</h1>
          {article.coverImagePath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mt-8 aspect-[5/3] w-full object-cover" src={uploadPublicPath(article.coverImagePath)} alt={article.titleZh} />
          ) : null}
          <div className="mt-10">
            <ArticleRenderer markdown={(useEnglish ? article.bodyEn : article.bodyZh) ?? ""} />
          </div>
        </article>
      </main>
    </PublicShell>
  );
}
