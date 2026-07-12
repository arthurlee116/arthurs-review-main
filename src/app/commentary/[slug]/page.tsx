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
  return await getArticlePageMetadata("commentary", slug, lang);
}

export default async function CommentaryArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  return <ArticlePage category="commentary" slug={slug} lang={lang} />;
}
