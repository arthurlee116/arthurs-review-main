import { ArticlePage } from "@/app/_articlePage";

export const dynamic = "force-dynamic";

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
