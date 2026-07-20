import { renderRss } from "@/lib/rss";
import { getCachedSetting, listCachedPublishedArticles } from "@/lib/services/public-content";

export async function GET() {
  const [articles, description] = await Promise.all([listCachedPublishedArticles(), getCachedSetting("rssDescription")]);
  return new Response(renderRss(articles, description), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
