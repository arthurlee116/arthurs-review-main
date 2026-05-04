import type { Metadata } from "next";
import type { CategoryId } from "@/lib/content/categories";
import { articlePath } from "@/lib/content/urls";
import { uploadPublicPath } from "@/lib/media/paths";
import type { Article } from "@/lib/services/articles";
import { absoluteUrl } from "@/lib/seo";

const siteName = "Arthur's Review";
const defaultDescription = "Arthur's Review, a personal intellectual publication.";

export function publicPageMetadata({
  title,
  description = defaultDescription,
  path,
  imagePath,
  type = "website",
}: {
  title: string;
  description?: string;
  path: string;
  imagePath?: string | null;
  type?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(path);
  const image = imagePath ? absoluteUrl(uploadPublicPath(imagePath)) : undefined;
  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName,
      type,
      images: image ? [{ url: image, alt: title }] : undefined,
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
