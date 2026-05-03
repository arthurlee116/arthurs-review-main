import { ArticleEditor } from "@/components/studio/ArticleEditor";

export default function NewArticlePage() {
  return (
    <section>
      <h1 className="mb-6 text-4xl font-bold">New article</h1>
      <ArticleEditor />
    </section>
  );
}
