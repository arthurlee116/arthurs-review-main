import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { articlePath } from "@/lib/content/urls";
import { absoluteUrl } from "@/lib/seo";
import { listCachedPublishedArticles } from "@/lib/services/public-content";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const staticPages = ["/", "/commentary", "/society", "/misc", "/life", "/archive", "/proofs", "/about", "/search"];
  const articles = await listCachedPublishedArticles();
  return [
    ...staticPages.map((path) => ({ url: absoluteUrl(path) })),
    ...articles.map((article) => ({
      url: absoluteUrl(articlePath(article.category, article.slug)),
      lastModified: article.updatedAt,
    })),
  ];
}
