import { connection } from "next/server";
import { renderRss } from "@/lib/rss";
import { getCachedSetting, listCachedPublishedArticles } from "@/lib/services/public-content";

export async function GET() {
  await connection();
  const [articles, description] = await Promise.all([listCachedPublishedArticles(undefined, { limit: 50 }), getCachedSetting("rssDescription")]);
  return new Response(renderRss(articles, description), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
