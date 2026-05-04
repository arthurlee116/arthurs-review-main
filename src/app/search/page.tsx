import { ArticleCard } from "@/components/ArticleCard";
import { SearchBox } from "@/components/SearchBox";
import { searchArticles } from "@/lib/services/search";
import { PublicShell } from "@/app/_publicShell";
import { publicPageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return publicPageMetadata({
    title: "Search",
    description: "Search Arthur's Review by title, body, category, and tags.",
    path: "/search",
  });
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const results = searchArticles(q);
  return (
    <PublicShell>
      <main className="container pb-10">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">Find</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="sans text-3xl font-bold leading-tight md:text-4xl">Search</h1>
          </div>
        </header>
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
