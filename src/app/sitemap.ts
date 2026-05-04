import type { MetadataRoute } from "next";
import { articlePath } from "@/lib/content/urls";
import { absoluteUrl } from "@/lib/seo";
import { listPublishedArticles } from "@/lib/services/articles";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = ["/", "/commentary", "/society", "/misc", "/about", "/search"];
  return [
    ...staticPages.map((path) => ({ url: absoluteUrl(path) })),
    ...listPublishedArticles().map((article) => ({
      url: absoluteUrl(articlePath(article.category, article.slug)),
      lastModified: article.updatedAt,
    })),
  ];
}
