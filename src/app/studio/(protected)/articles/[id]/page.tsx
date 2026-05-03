import { notFound } from "next/navigation";
import { ArticleEditor } from "@/components/studio/ArticleEditor";
import { getArticleById } from "@/lib/services/articles";

export const dynamic = "force-dynamic";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getArticleById(Number(id), { includeDraft: true });
  if (!article) notFound();
  return (
    <section>
      <h1 className="mb-6 text-4xl font-bold">Edit article</h1>
      <ArticleEditor article={article} />
    </section>
  );
}
