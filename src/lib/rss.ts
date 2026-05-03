import { articlePath } from "@/lib/content/urls";
import { absoluteUrl } from "@/lib/seo";
import type { Article } from "@/lib/services/articles";

function escapeXml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderRss(articles: Article[], description: string) {
  const items = articles
    .map((article) => {
      const url = absoluteUrl(articlePath(article.category, article.slug));
      return `<item><title>${escapeXml(article.titleZh)}</title><link>${url}</link><guid>${url}</guid><description>${escapeXml(
        article.excerptZh,
      )}</description><pubDate>${new Date(article.publishedAt ?? article.updatedAt).toUTCString()}</pubDate></item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Arthur&apos;s Review</title><link>${absoluteUrl(
    "/",
  )}</link><description>${escapeXml(description)}</description>${items}</channel></rss>`;
}
