import { connection } from "next/server";
import { ArticleEditor } from "@/components/studio/ArticleEditor";
import { listTags } from "@/lib/services/tags";

export const instant = false;

export default async function NewArticlePage() {
  await connection();
  return (
    <section>
      <h1 className="mb-6 text-4xl font-bold">New article</h1>
      <ArticleEditor availableTags={listTags()} />
    </section>
  );
}
