import { renderRss } from "@/lib/rss";
import { listPublishedArticles } from "@/lib/services/articles";
import { getSetting } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(renderRss(listPublishedArticles(), getSetting("rssDescription")), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
