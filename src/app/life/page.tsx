import { io } from "next/cache";
import { Suspense } from "react";
import { CategoryPageFallback } from "@/app/_categoryPage";
import { PublicShell } from "@/app/_publicShell";
import { PhotoWall } from "@/components/life/PhotoWall";
import { categories } from "@/lib/content/categories";
import { categoryMetadata } from "@/lib/metadata";
import { listCachedPublishedArticles } from "@/lib/services/public-content";

export function generateMetadata() {
  return categoryMetadata("life", "生活");
}

async function LifeCategoryPage() {
  await io();
  const articles = await listCachedPublishedArticles("life", { limit: 50 });
  return (
    <PublicShell>
      <main className="container pb-10">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">Archive</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">{categories.life.label}</h1>
          </div>
        </header>
        {articles.length ? (
          <div className="pt-8">
            <PhotoWall articles={articles} />
          </div>
        ) : (
          <p className="sans py-10 text-sm text-[var(--muted)]">生活相册还没有内容。</p>
        )}
      </main>
    </PublicShell>
  );
}

export default function LifePage() {
  return (
    <Suspense fallback={<CategoryPageFallback />}>
      <LifeCategoryPage />
    </Suspense>
  );
}
