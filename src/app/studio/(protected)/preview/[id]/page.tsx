import { notFound } from "next/navigation";
import { ArticleMeta } from "@/components/ArticleMeta";
import { ArticleRenderer } from "@/components/ArticleRenderer";
import { getArticleById } from "@/lib/services/articles";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getArticleById(Number(id), { includeDraft: true });
  if (!article) notFound();
  return (
    <article className="reading py-10">
      <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
      <h1 className="mt-5 text-5xl font-bold leading-none">{article.titleZh}</h1>
      <div className="mt-10">
        <ArticleRenderer markdown={article.bodyZh ?? ""} />
      </div>
    </article>
  );
}
