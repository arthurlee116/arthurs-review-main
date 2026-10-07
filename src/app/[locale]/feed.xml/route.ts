import { connection } from "next/server";
import { renderRss } from "@/lib/rss";
import { isLocale } from "@/lib/i18n/locale";
import { getCachedSettings, listCachedPublishedArticles } from "@/lib/services/public-content";
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });
  const [articles, settings] = await Promise.all([listCachedPublishedArticles(undefined, { limit: 50 }), getCachedSettings()]);
  return new Response(renderRss(articles, locale === "zh" ? settings.rssDescriptionZh : settings.rssDescription, locale), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
