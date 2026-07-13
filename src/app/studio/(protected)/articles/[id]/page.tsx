import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArticleEditor } from "@/components/studio/ArticleEditor";
import { getArticleById } from "@/lib/services/articles";
import { listPublicationProofs } from "@/lib/services/publication-proofs";
import { listTags } from "@/lib/services/tags";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const article = getArticleById(Number(id), { includeDraft: true });
  if (!article) notFound();
  const proofs = listPublicationProofs(article.id);
  return (
    <section>
      <h1 className="mb-6 text-4xl font-bold">Edit article</h1>
      <ArticleEditor article={article} availableTags={listTags()} />
      {proofs.length ? (
        <section className="sans mt-8 border-t border-[var(--rule)] pt-5 text-sm">
          <h2 className="font-semibold">Publication proofs</h2>
          <div className="mt-3 grid gap-3">
            {proofs.map((proof) => (
              <div key={proof.id} className="border-l border-[var(--rule)] pl-3">
                <time dateTime={proof.createdAt}>{new Date(proof.createdAt).toLocaleString("en-GB")}</time>
                <p>OpenTimestamps: {proof.otsStatus}{proof.otsError ? ` — ${proof.otsError}` : ""}</p>
                <p>Wayback: {proof.waybackStatus}{proof.waybackError ? ` — ${proof.waybackError}` : ""}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
