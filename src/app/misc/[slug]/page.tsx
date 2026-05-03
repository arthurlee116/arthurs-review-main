import { ArticlePage } from "@/app/_articlePage";

export const dynamic = "force-dynamic";

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
