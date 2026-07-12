import { ArticlePage, getArticlePageMetadata } from "@/app/_articlePage";

export const instant = false;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  return await getArticlePageMetadata("misc", slug, lang);
}

export default async function MiscArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  return <ArticlePage category="misc" slug={slug} lang={lang} />;
}
