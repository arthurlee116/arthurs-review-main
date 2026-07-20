import { Suspense } from "react";
import { ArticlePageFallback, ArticlePageFromParams, getArticlePageMetadata } from "@/app/_articlePage";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ slug }, { lang }] = await Promise.all([params, searchParams]);
  return await getArticlePageMetadata("society", slug, lang);
}

export default function SocietyArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  return (
    <Suspense fallback={<ArticlePageFallback />}>
      <ArticlePageFromParams category="society" params={params} searchParams={searchParams} />
    </Suspense>
  );
}
