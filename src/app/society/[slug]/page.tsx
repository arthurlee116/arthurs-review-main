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
  return await getArticlePageMetadata("society", slug, lang);
}

export default async function SocietyArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  return <ArticlePage category="society" slug={slug} lang={lang} />;
}
