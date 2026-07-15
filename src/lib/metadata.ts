import type { Metadata } from "next";
import { categoryLabel, type CategoryId } from "@/lib/content/categories";
import { articlePath } from "@/lib/content/urls";
import { uploadPublicPath } from "@/lib/media/paths";
import type { Article } from "@/lib/services/articles";
import { absoluteUrl } from "@/lib/seo";

const siteName = "Arthur's Review";
const defaultDescription = "Arthur's Review, a personal intellectual publication.";

export function socialImageUrl(title: string, kicker = siteName) {
  const params = new URLSearchParams({ title, kicker });
  return absoluteUrl(`/og?${params.toString()}`);
}

export function publicPageMetadata({
  title,
  description = defaultDescription,
  path,
  imagePath,
  kicker,
  type = "website",
}: {
  title: string;
  description?: string;
  path: string;
  imagePath?: string | null;
  kicker?: string;
  type?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(path);
  const image = imagePath ? absoluteUrl(uploadPublicPath(imagePath)) : socialImageUrl(title, kicker);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      types: {
        "application/rss+xml": absoluteUrl("/feed.xml"),
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName,
      type,
      images: [{ url: image, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: title }],
    },
  };
}

export function articleMetadata(article: Article, lang?: string): Metadata {
  const useEnglish = lang === "en" && article.bodyEn;
  const title = useEnglish ? (article.titleEn ?? article.titleZh) : article.titleZh;
  const description = (useEnglish ? article.excerptEn : article.seoDescription) || article.seoDescription || article.excerptZh || defaultDescription;
  return publicPageMetadata({
    title,
    description,
    path: articlePath(article.category, article.slug),
    imagePath: article.coverImagePath,
    kicker: categoryLabel(article.category),
    type: "article",
  });
}

export function categoryMetadata(category: CategoryId, label: string): Metadata {
  return publicPageMetadata({
    title: label,
    description: `${label} archive from Arthur's Review.`,
    path: `/${category}`,
  });
}
