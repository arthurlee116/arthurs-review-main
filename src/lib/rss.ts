import { localizedPath, languageTag, type Locale } from "@/lib/i18n/locale";
import { articleDisplay } from "@/lib/i18n/article";
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

export function renderRss(articles: Article[], description: string, locale?: Locale) {
  const items = articles
    .map((article) => {
      const path = articlePath(article.category, article.slug);
      const guid = absoluteUrl(path);
      const url = absoluteUrl(locale ? localizedPath(path, locale) : path);
      const display = articleDisplay(article, locale ?? "zh");
      return `<item><title>${escapeXml(display.title)}</title><link>${url}</link><guid>${guid}</guid><description>${escapeXml(
        display.excerpt,
      )}</description><pubDate>${new Date(article.publishedAt ?? article.updatedAt).toUTCString()}</pubDate></item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Arthur&apos;s Review</title><link>${absoluteUrl(
    locale ? localizedPath("/", locale) : "/",
  )}</link><description>${escapeXml(description)}</description><language>${languageTag[locale ?? "zh"]}</language>${items}</channel></rss>`;
}
