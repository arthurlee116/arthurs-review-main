import { getLocale } from "@/lib/i18n/server";
import { dictionary } from "@/lib/i18n/dictionary";
import { type Locale } from "@/lib/i18n/locale";
import { io } from "next/cache";
import { Suspense } from "react";
import { CategoryPageFallback } from "@/app/_categoryPage";
import { PublicShell } from "@/app/_publicShell";
import { PhotoWall } from "@/components/life/PhotoWall";
import { categoryMetadata } from "@/lib/metadata";
import { getCachedLifeListing } from "@/lib/services/public-content";

export async function generateMetadata() {
  const locale = await getLocale();
  return categoryMetadata("life", undefined, locale);
}

async function LifeCategoryPage({ locale = "zh" }: { locale?: Locale } = {}) {
  await io();
  const { articles, mediaCounts } = await getCachedLifeListing();
  return (
    <PublicShell locale={locale}>
      <main className="container pb-10">
        <header className="border-b border-[var(--rule)] py-8">
          <p className="sans text-xs font-bold uppercase text-[var(--muted)]">{dictionary(locale).archive}</p>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-1 w-12 bg-[var(--accent)]" aria-hidden="true" />
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">{dictionary(locale).life}</h1>
          </div>
        </header>
        {articles.length ? (
          <div className="pt-8">
            <PhotoWall locale={locale} articles={articles} mediaCounts={mediaCounts} />
          </div>
        ) : (
          <p className="sans py-10 text-sm text-[var(--muted)]">{dictionary(locale).noLife}</p>
        )}
      </main>
    </PublicShell>
  );
}

export default async function LifePage() {
  const locale = await getLocale();
  return (
    <Suspense fallback={<CategoryPageFallback />}>
      <LifeCategoryPage locale={locale} />
    </Suspense>
  );
}
