import { ArticleCard } from "@/components/ArticleCard";
import { SearchBox } from "@/components/SearchBox";
import { searchArticles } from "@/lib/services/search";
import { PublicShell } from "@/app/_publicShell";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const results = searchArticles(q);
  return (
    <PublicShell>
      <main className="container py-10">
        <h1 className="border-b border-[var(--rule)] pb-4 text-5xl font-bold">Search</h1>
        <div className="my-8">
          <SearchBox defaultValue={q} />
        </div>
        {q && results.length === 0 ? <p className="sans py-10 text-sm text-[var(--muted)]">No matching articles.</p> : null}
        {results.map((article) => (
          <ArticleCard key={article.id} article={article} large />
        ))}
      </main>
    </PublicShell>
  );
}
