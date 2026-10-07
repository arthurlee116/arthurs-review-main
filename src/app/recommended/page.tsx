import { io } from "next/cache";
import { Suspense } from "react";
import { PublicShell } from "@/app/_publicShell";
import { ArticleCard } from "@/components/ArticleCard";
import { PageNavigation } from "@/components/PageNavigation";
import { publicPageMetadata } from "@/lib/metadata";
import { parsePageParam } from "@/lib/pagination";
import { listCachedPublishedArticlePage } from "@/lib/services/public-content";

export const metadata = publicPageMetadata({
  title: "推荐",
  description: "Arthur's Review 推荐阅读。",
  path: "/recommended",
});

export async function RecommendedContent({ page = 1 }: { page?: number } = {}) {
  await io();
  const articles = await listCachedPublishedArticlePage(page, 50, { featuredOnly: true, excludeLife: true });
  return (
    <PublicShell mastheadHeadingLevel={2}>
      <main className="container pb-10">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">Recommended reading</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">推荐</h1>
          </div>
        </header>
        {articles.items.length ? (
          <section>
            {articles.items.map((article, index) => <ArticleCard key={article.id} article={article} large eagerImage={index === 0} />)}
          </section>
        ) : <p className="sans py-10 text-sm text-[var(--muted)]">暂时没有推荐文章。</p>}
        <PageNavigation basePath="/recommended" page={articles.page} totalPages={articles.totalPages} label="推荐文章分页" />
      </main>
    </PublicShell>
  );
}

async function RecommendedContentFromParams({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return <RecommendedContent page={parsePageParam(page)} />;
}

export default function RecommendedPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <Suspense fallback={<PublicShell mastheadHeadingLevel={2}><main className="container min-h-[50vh]" aria-busy="true" /></PublicShell>}>
      <RecommendedContentFromParams searchParams={searchParams} />
    </Suspense>
  );
}
