import { localizedPath } from "@/lib/i18n/locale";
import { hasEnglishArticle } from "@/lib/i18n/article";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { articlePath } from "@/lib/content/urls";
import { absoluteUrl } from "@/lib/seo";
import { listCachedPublishedArticles } from "@/lib/services/public-content";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const staticPages = ["/", "/recommended", "/commentary", "/society", "/misc", "/life", "/archive", "/proofs", "/about", "/search"];
  const articles = await listCachedPublishedArticles();
  const alternates = (path: string, english = true) => ({ languages: { "zh-CN": absoluteUrl(localizedPath(path, "zh")), ...(english ? { en: absoluteUrl(localizedPath(path, "en")) } : {}) } });
  return [
    ...staticPages.flatMap((path) => (["zh", "en"] as const).map((locale) => ({ url: absoluteUrl(localizedPath(path, locale)), alternates: alternates(path) }))),
    ...articles.flatMap((article) => {
      const path = articlePath(article.category, article.slug);
      const english = hasEnglishArticle(article);
      return (english ? ["zh", "en"] as const : ["zh"] as const).map((locale) => ({ url: absoluteUrl(localizedPath(path, locale)), lastModified: article.updatedAt, alternates: alternates(path, english) }));
    }),
  ];
}
