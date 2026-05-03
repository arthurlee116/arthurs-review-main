import Link from "next/link";
import { listStudioArticles } from "@/lib/services/articles";

export const dynamic = "force-dynamic";

export default function ArticlesPage() {
  const articles = listStudioArticles();
  return (
    <section>
      <h1 className="text-4xl font-bold">Articles</h1>
      <div className="sans mt-6 grid gap-3">
        {articles.map((article) => (
          <Link key={article.id} className="flex justify-between border-b border-[var(--rule)] py-3" href={`/studio/articles/${article.id}`}>
            <span>{article.titleZh}</span>
            <span>{article.status}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
