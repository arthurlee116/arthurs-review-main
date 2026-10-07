import { Suspense } from "react";
import { ArticlePageFallback, ArticlePageFromParams, getArticlePageMetadata } from "@/app/_articlePage";
import { getLocale } from "@/lib/i18n/server";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  return getArticlePageMetadata("commentary", slug, locale);
}
export default async function ArticleRoute({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await getLocale();
  return <Suspense fallback={<ArticlePageFallback locale={locale} />}><ArticlePageFromParams category="commentary" params={params} locale={locale} /></Suspense>;
}
